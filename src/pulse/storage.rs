//! Pulse database layer using rusqlite (synchronous, wrapped in spawn_blocking).

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use crate::pulse::models::{CollectorRun, FeedItem, ProviderSetting, RawItem};

#[derive(Clone)]
pub struct PulseDatabase {
    /// Path to the SQLite database file. Each operation opens its own connection
    /// to avoid Mutex contention between the scheduler and API handlers.
    path: Arc<String>,
}

impl PulseDatabase {
    pub async fn new(db_path: &str) -> Result<Self> {
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create directory: {}", parent.display()))?;
        }

        // Open once to set WAL mode and run migrations
        let path = db_path.to_string();
        let p2 = path.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = Connection::open(&p2)?;
            conn.execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
            )?;
            drop(conn);
            Ok(())
        })
        .await??;

        let db = Self {
            path: Arc::new(path),
        };
        db.run_migrations().await?;
        tracing::info!("Pulse database initialized at {}", db_path);
        Ok(db)
    }

    /// Open a new connection for an operation.
    fn open(&self) -> Result<Connection> {
        let conn = Connection::open(self.path.as_str())?;
        conn.execute_batch("PRAGMA busy_timeout=5000;")?;
        Ok(conn)
    }

    async fn run_migrations(&self) -> Result<()> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = Connection::open(path.as_str())?;
            c.execute_batch(
                "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, source TEXT NOT NULL, collector_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT, content TEXT, metadata TEXT NOT NULL DEFAULT '{}', published_at TEXT, collected_at TEXT NOT NULL);
                 CREATE INDEX IF NOT EXISTS idx_items_collected_at ON items(collected_at);
                 CREATE INDEX IF NOT EXISTS idx_items_source ON items(source);
                 CREATE TABLE IF NOT EXISTS collector_runs (id TEXT PRIMARY KEY, collector_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, items_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running', error TEXT);
                 CREATE TABLE IF NOT EXISTS provider_settings (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, api_key TEXT, model TEXT, endpoint TEXT, enabled BOOLEAN NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT 0, extra_config TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                 CREATE TABLE IF NOT EXISTS collector_settings (id TEXT PRIMARY KEY, interval_secs INTEGER NOT NULL);
                 CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE IF NOT EXISTS user_feeds (name TEXT NOT NULL, url TEXT NOT NULL PRIMARY KEY);
                 CREATE TABLE IF NOT EXISTS video_channels (platform TEXT NOT NULL, channel_id TEXT NOT NULL, display_name TEXT NOT NULL, PRIMARY KEY (platform, channel_id));"
            )?;
            Ok(())
        }).await??;
        Ok(())
    }

    pub async fn insert_item(&self, raw: &RawItem) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let metadata = serde_json::to_string(&raw.metadata)?;
        let published = raw.published_at.map(|d| d.to_rfc3339());
        let item = raw.clone();
        let id2 = id.clone();
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = Connection::open(path.as_str())?;
            c.execute("INSERT INTO items (id,source,collector_id,title,url,content,metadata,published_at,collected_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![id2, item.source, item.collector_id, item.title, item.url, item.content, metadata, published, now])?;
            Ok(())
        }).await??;
        Ok(id)
    }

    pub async fn item_exists_by_url(&self, url: &str) -> Result<bool> {
        let path = self.path.clone();
        let url = url.to_string();
        tokio::task::spawn_blocking(move || -> Result<bool> {
            let c = Connection::open(path.as_str())?;
            let count: i64 = c.query_row(
                "SELECT COUNT(*) FROM items WHERE url=?1",
                params![url],
                |r| r.get(0),
            )?;
            Ok(count > 0)
        })
        .await?
    }

    pub async fn get_feed(
        &self,
        limit: u32,
        offset: u32,
        source: Option<&str>,
    ) -> Result<Vec<FeedItem>> {
        let path = self.path.clone();
        let source = source.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || -> Result<Vec<FeedItem>> {
            let c = Connection::open(path.as_str())?;
            let query = if let Some(ref src) = source {
                format!("SELECT id,source,collector_id,title,url,content,metadata,published_at,collected_at FROM items WHERE (source='{src}' OR source LIKE '{src}:%' OR collector_id='{src}') ORDER BY collected_at DESC LIMIT {limit} OFFSET {offset}")
            } else {
                format!("SELECT id,source,collector_id,title,url,content,metadata,published_at,collected_at FROM items ORDER BY collected_at DESC LIMIT {limit} OFFSET {offset}")
            };
            let mut stmt = c.prepare(&query)?;
            let items = stmt.query_map([], |row| {
                Ok(FeedItem {
                    id: row.get(0)?, source: row.get(1)?, collector_id: row.get(2)?,
                    title: row.get(3)?, url: row.get(4)?, content: row.get(5)?,
                    summary: None,
                    metadata: serde_json::from_str(&row.get::<_,String>(6).unwrap_or_default()).unwrap_or_default(),
                    tags: vec![], score: None,
                    published_at: row.get::<_,Option<String>>(7)?.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)),
                    collected_at: row.get::<_,String>(8).ok().and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(Utc::now),
                })
            })?.filter_map(|r| r.ok()).collect();
            Ok(items)
        }).await?
    }

    pub async fn get_digest(&self, limit: u32) -> Result<Vec<FeedItem>> {
        self.get_feed(limit, 0, None).await
    }

    pub async fn start_collector_run(&self, collector_id: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let path = self.path.clone();
        let cid = collector_id.to_string();
        let id2 = id.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("INSERT INTO collector_runs (id,collector_id,started_at,status) VALUES (?1,?2,?3,'running')", params![id2,cid,now])?; Ok(())
        }).await??;
        Ok(id)
    }

    pub async fn finish_collector_run(
        &self,
        run_id: &str,
        items_count: u32,
        error: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let status = if error.is_some() { "error" } else { "success" };
        let path = self.path.clone();
        let rid = run_id.to_string();
        let err = error.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("UPDATE collector_runs SET finished_at=?1,items_count=?2,status=?3,error=?4 WHERE id=?5", params![now,items_count,status,err,rid])?; Ok(())
        }).await??;
        Ok(())
    }

    pub async fn get_collector_status(&self) -> Result<Vec<CollectorRun>> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<CollectorRun>> {
            let c = Connection::open(path.as_str())?;
            let mut stmt = c.prepare("SELECT id,collector_id,started_at,finished_at,items_count,status,error FROM collector_runs ORDER BY started_at DESC LIMIT 20")?;
            let runs = stmt.query_map([], |r| Ok(CollectorRun {
                id: r.get(0)?, collector_id: r.get(1)?,
                started_at: r.get::<_,String>(2).ok().and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(Utc::now),
                finished_at: r.get::<_,Option<String>>(3)?.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)),
                items_count: r.get::<_,i64>(4)? as u32, status: r.get(5)?, error: r.get(6)?,
            }))?.filter_map(|r| r.ok()).collect();
            Ok(runs)
        }).await?
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let path = self.path.clone();
        let key = key.to_string();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            Ok(Connection::open(path.as_str())?
                .query_row(
                    "SELECT value FROM app_settings WHERE key=?1",
                    params![key],
                    |r| r.get(0),
                )
                .ok())
        })
        .await?
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let path = self.path.clone();
        let k = key.to_string();
        let v = value.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("INSERT INTO app_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![k,v])?; Ok(())
        }).await??;
        Ok(())
    }

    pub async fn get_all_settings(&self) -> Result<Vec<(String, String)>> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>> {
            let c = Connection::open(path.as_str())?;
            let mut stmt = c.prepare("SELECT key,value FROM app_settings")?;
            let rows: Vec<_> = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })
        .await?
    }

    pub async fn get_all_collector_intervals(&self) -> Result<Vec<(String, u64)>> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<(String, u64)>> {
            let c = Connection::open(path.as_str())?;
            let mut stmt = c.prepare("SELECT id,interval_secs FROM collector_settings")?;
            let rows: Vec<_> = stmt
                .query_map([], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as u64))
                })?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })
        .await?
    }

    pub async fn set_collector_interval(&self, id: &str, secs: u64) -> Result<()> {
        let path = self.path.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("INSERT INTO collector_settings (id,interval_secs) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET interval_secs=excluded.interval_secs", params![id, secs as i64])?; Ok(())
        }).await??;
        Ok(())
    }

    pub async fn get_providers(&self) -> Result<Vec<ProviderSetting>> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<ProviderSetting>> {
            let c = Connection::open(path.as_str())?;
            let mut stmt = c.prepare("SELECT id,display_name,api_key,model,endpoint,enabled,is_active,extra_config,created_at,updated_at FROM provider_settings ORDER BY display_name")?;
            let rows: Vec<_> = stmt.query_map([], |r| Ok(ProviderSetting {
                id: r.get(0)?, display_name: r.get(1)?, api_key: r.get(2)?, model: r.get(3)?, endpoint: r.get(4)?,
                enabled: r.get(5)?, is_active: r.get(6)?,
                extra_config: serde_json::from_str(&r.get::<_,String>(7).unwrap_or_default()).unwrap_or_default(),
                created_at: r.get(8)?, updated_at: r.get(9)?,
            }))?.filter_map(|r| r.ok()).collect();
            Ok(rows)
        }).await?
    }

    pub async fn get_provider(&self, id: &str) -> Result<Option<ProviderSetting>> {
        let path = self.path.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || -> Result<Option<ProviderSetting>> {
            Ok(Connection::open(path.as_str())?.query_row("SELECT id,display_name,api_key,model,endpoint,enabled,is_active,extra_config,created_at,updated_at FROM provider_settings WHERE id=?1", params![id], |r| Ok(ProviderSetting {
                id: r.get(0)?, display_name: r.get(1)?, api_key: r.get(2)?, model: r.get(3)?, endpoint: r.get(4)?,
                enabled: r.get(5)?, is_active: r.get(6)?,
                extra_config: serde_json::from_str(&r.get::<_,String>(7).unwrap_or_default()).unwrap_or_default(),
                created_at: r.get(8)?, updated_at: r.get(9)?,
            })).ok())
        }).await?
    }

    pub async fn upsert_provider(&self, s: &ProviderSetting) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let extra = serde_json::to_string(&s.extra_config)?;
        let s = s.clone();
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("INSERT INTO provider_settings (id,display_name,api_key,model,endpoint,enabled,is_active,extra_config,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, api_key=COALESCE(excluded.api_key, provider_settings.api_key), model=excluded.model, endpoint=excluded.endpoint, enabled=excluded.enabled, is_active=excluded.is_active, extra_config=excluded.extra_config, updated_at=excluded.updated_at",
                params![s.id, s.display_name, s.api_key, s.model, s.endpoint, s.enabled, s.is_active, extra, now, now])?; Ok(())
        }).await??;
        Ok(())
    }

    pub async fn delete_provider_key(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let path = self.path.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("UPDATE provider_settings SET api_key=NULL,enabled=0,is_active=0,updated_at=?1 WHERE id=?2", params![now,id])?; Ok(())
        }).await??;
        Ok(())
    }

    pub async fn set_active_provider(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let path = self.path.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = Connection::open(path.as_str())?;
            c.execute(
                "UPDATE provider_settings SET is_active=0,updated_at=?1",
                params![now],
            )?;
            c.execute(
                "UPDATE provider_settings SET is_active=1,enabled=1,updated_at=?1 WHERE id=?2",
                params![now, id],
            )?;
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn get_user_feeds(&self) -> Result<Vec<(String, String)>> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>> {
            let c = Connection::open(path.as_str())?;
            let mut stmt = c.prepare("SELECT name,url FROM user_feeds ORDER BY name")?;
            let rows: Vec<_> = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })
        .await?
    }

    pub async fn add_user_feed(&self, name: &str, url: &str) -> Result<()> {
        let path = self.path.clone();
        let n = name.to_string();
        let u = url.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute(
                "INSERT OR REPLACE INTO user_feeds (name,url) VALUES (?1,?2)",
                params![n, u],
            )?;
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn remove_user_feed(&self, url: &str) -> Result<()> {
        let path = self.path.clone();
        let u = url.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?
                .execute("DELETE FROM user_feeds WHERE url=?1", params![u])?;
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn get_video_channels(&self) -> Result<Vec<(String, String, String)>> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<(String, String, String)>> {
            let c = Connection::open(path.as_str())?;
            let mut stmt = c.prepare(
                "SELECT platform,channel_id,display_name FROM video_channels ORDER BY display_name",
            )?;
            let rows: Vec<_> = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })
        .await?
    }

    pub async fn add_video_channel(
        &self,
        platform: &str,
        channel_id: &str,
        name: &str,
    ) -> Result<()> {
        let path = self.path.clone();
        let p = platform.to_string();
        let c2 = channel_id.to_string();
        let n = name.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute("INSERT OR REPLACE INTO video_channels (platform,channel_id,display_name) VALUES (?1,?2,?3)", params![p,c2,n])?; Ok(())
        }).await??;
        Ok(())
    }

    pub async fn remove_video_channel(&self, platform: &str, channel_id: &str) -> Result<()> {
        let path = self.path.clone();
        let p = platform.to_string();
        let c2 = channel_id.to_string();
        tokio::task::spawn_blocking(move || -> Result<()> {
            Connection::open(path.as_str())?.execute(
                "DELETE FROM video_channels WHERE platform=?1 AND channel_id=?2",
                params![p, c2],
            )?;
            Ok(())
        })
        .await??;
        Ok(())
    }
}
