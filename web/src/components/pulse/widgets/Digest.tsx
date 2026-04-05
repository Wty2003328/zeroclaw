import { useState } from 'react';
import { useWidgetData } from '../../../hooks/useWidgetData';
import { timeAgo } from '../../../lib/time';
import { ExternalLink } from 'lucide-react';
import type { WidgetDimensions } from '../../../lib/widget-size';
import type { FeedResponse, FeedItem } from '../../../types/pulse';

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

function sourceLabel(source: string): string {
  let label = source;
  if (label.startsWith('rss:')) label = label.slice(4);
  return label.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DigestItem({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const score = item.score != null ? Math.round(item.score * 10) / 10 : 0;
  const scorePercent = Math.min(100, Math.round((score / 10) * 100));
  const hasContent = !!(item.content || item.summary || item.url);

  return (
    <div className="relative rounded-md border-l-[3px] border-l-primary transition-colors hover:bg-accent/40 overflow-hidden">
      <div className="px-1.5 py-1 cursor-pointer overflow-hidden" onClick={() => hasContent && setExpanded(!expanded)}>
        <div className="absolute top-0 left-0 h-full z-0" style={{ width: `${scorePercent}%`, background: 'linear-gradient(90deg, rgba(108,140,255,0.1), transparent)' }} />
        <div className="relative z-10 overflow-hidden">
          <h4 className="cq-text-sm font-medium leading-tight overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{item.title}</h4>
          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden" style={{ fontSize: '10px' }}>
            <span className="font-bold text-primary shrink-0">{score}</span>
            <span className="text-primary shrink-0 truncate max-w-[35%]">{sourceLabel(item.source)}</span>
            <span className="text-muted-foreground shrink-0">{item.published_at ? timeAgo(item.published_at) : timeAgo(item.collected_at)}</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="pl-5 pr-2 pb-2 border-t border-border/40 pt-1.5 space-y-1.5">
          {item.summary && <p className="text-sm text-muted-foreground leading-relaxed italic">{item.summary}</p>}
          {item.content && <div className="text-sm text-foreground/80 leading-relaxed max-h-40 overflow-y-auto">{stripHtml(item.content).slice(0, 600)}{stripHtml(item.content).length > 600 && '...'}</div>}
          {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Open article <ExternalLink className="w-3 h-3"/></a>}
        </div>
      )}
    </div>
  );
}

interface Props { dims?: WidgetDimensions }

export default function Digest({ }: Props) {
  const { data, loading, error } = useWidgetData<FeedResponse>('/api/pulse/feed/digest?limit=10', 120000);

  if (loading) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;
  if (error) return <div className="flex-1 flex items-center justify-center text-destructive text-sm">Error</div>;
  if (!data || data.items.length === 0) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No digest yet</div>;

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Tiny: plain titles */}
      <div className="@[200px]:hidden flex-1 overflow-y-auto">
        {data.items.map((item) => (
          <div key={item.id} className="py-0.5 truncate cq-text-xs cursor-pointer hover:text-[var(--pc-accent)]"
            style={{ color: 'var(--pc-text-primary)' }}
            onClick={() => item.url && window.open(item.url, '_blank')}>
            {item.title}
          </div>
        ))}
      </div>
      {/* Normal: full items */}
      <div className="hidden @[200px]:flex flex-col overflow-hidden h-full">
        <div className="flex-1 overflow-y-auto flex flex-col gap-1">
          {data.items.map((item) => <DigestItem key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  );
}
