use axum::{Router, response::Json, routing::get};
use std::time::Duration;
use sysinfo::System;

use crate::pulse::PulseState;

pub fn routes() -> Router<PulseState> {
    Router::new().route("/stats", get(system_stats))
}

async fn system_stats() -> Json<serde_json::Value> {
    let result = tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_memory();
        sys.refresh_cpu_all();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let hostname = System::host_name().unwrap_or_else(|| "unknown".to_string());
        let os = System::long_os_version().unwrap_or_default();
        let kernel = System::kernel_version().unwrap_or_default();
        let uptime = System::uptime();
        let cpu_count = sys.cpus().len().max(1);
        let cpu_percent = sys.global_cpu_usage();

        let mem_used = sys.used_memory();
        let mem_total = sys.total_memory();
        let mem_pct = if mem_total > 0 {
            (mem_used as f64 / mem_total as f64) * 100.0
        } else {
            0.0
        };

        let swap_used = sys.used_swap();
        let swap_total = sys.total_swap();
        let swap_pct = if swap_total > 0 {
            (swap_used as f64 / swap_total as f64) * 100.0
        } else {
            0.0
        };

        let proc_count = sys.processes().len();

        // Disk enumeration: safe on native OS, can hang on WSL2.
        // Run with a timeout thread to avoid blocking forever.
        let (disk_used, disk_total) = get_disk_usage_safe();
        let disk_pct = if disk_total > 0 {
            (disk_used as f64 / disk_total as f64) * 100.0
        } else {
            0.0
        };

        // Network: safe on all platforms
        let (net_rx, net_tx) = get_network_usage_safe();

        serde_json::json!({
            "hostname": hostname,
            "os": os,
            "kernel": kernel,
            "uptime_secs": uptime,
            "cpu_percent": (cpu_percent as f64 * 10.0).round() / 10.0,
            "cpu_count": cpu_count,
            "memory_used_bytes": mem_used,
            "memory_total_bytes": mem_total,
            "memory_percent": (mem_pct * 10.0).round() / 10.0,
            "swap_used_bytes": swap_used,
            "swap_total_bytes": swap_total,
            "swap_percent": (swap_pct * 10.0).round() / 10.0,
            "disk_used_bytes": disk_used,
            "disk_total_bytes": disk_total,
            "disk_percent": (disk_pct * 10.0).round() / 10.0,
            "process_count": proc_count,
            "network_rx_bytes": net_rx,
            "network_tx_bytes": net_tx,
        })
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({"error": "unavailable"}));

    Json(result)
}

/// Get disk usage with a 3-second timeout to avoid WSL2 hangs.
fn get_disk_usage_safe() -> (u64, u64) {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let disks = sysinfo::Disks::new_with_refreshed_list();
        let result = disks.iter().fold((0u64, 0u64), |(u, t), d| {
            (
                u + (d.total_space() - d.available_space()),
                t + d.total_space(),
            )
        });
        let _ = tx.send(result);
    });
    rx.recv_timeout(Duration::from_secs(3)).unwrap_or((0, 0))
}

/// Get network usage with a 3-second timeout.
fn get_network_usage_safe() -> (u64, u64) {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let networks = sysinfo::Networks::new_with_refreshed_list();
        let result = networks.iter().fold((0u64, 0u64), |(rx, tx), (_, n)| {
            (rx + n.total_received(), tx + n.total_transmitted())
        });
        let _ = tx.send(result);
    });
    rx.recv_timeout(Duration::from_secs(3)).unwrap_or((0, 0))
}
