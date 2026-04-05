import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import GridLayout from 'react-grid-layout';
import NewsFeed from '../components/pulse/widgets/NewsFeed';
import CollectorStatus from '../components/pulse/widgets/CollectorStatus';
import StockTicker from '../components/pulse/widgets/StockTicker';
import Weather from '../components/pulse/widgets/Weather';
import Digest from '../components/pulse/widgets/Digest';
import Trending from '../components/pulse/widgets/Trending';
import SystemMonitor from '../components/pulse/widgets/SystemMonitor';
import Calendar from '../components/pulse/widgets/Calendar';
import ZeroClawAgent from '../components/pulse/widgets/ZeroClawAgent';
import Videos from '../components/pulse/widgets/Videos';
import { GripHorizontal } from 'lucide-react';
import { getWidgetSize, getOrientation } from '../lib/widget-size';

const COLS = 12;
const GAP = 8;

const defaultLayout: any[] = [
  { i: 'feed',       x: 0,  y: 0, w: 5, h: 6, minW: 1, minH: 1 },
  { i: 'digest',     x: 5,  y: 0, w: 4, h: 4, minW: 1, minH: 1 },
  { i: 'weather',    x: 9,  y: 0, w: 3, h: 4, minW: 1, minH: 1 },
  { i: 'stocks',     x: 5,  y: 4, w: 4, h: 3, minW: 1, minH: 1 },
  { i: 'system',     x: 9,  y: 4, w: 3, h: 3, minW: 1, minH: 1 },
  { i: 'calendar',   x: 0,  y: 6, w: 3, h: 3, minW: 1, minH: 1 },
  { i: 'zeroclaw',   x: 3,  y: 6, w: 4, h: 3, minW: 1, minH: 1 },
  { i: 'trending',   x: 7,  y: 6, w: 3, h: 3, minW: 1, minH: 1 },
  { i: 'collectors', x: 10, y: 6, w: 2, h: 3, minW: 1, minH: 1 },
  { i: 'videos',     x: 0,  y: 9, w: 5, h: 4, minW: 1, minH: 1 },
];

function loadLayout(): any[] {
  try {
    const stored = localStorage.getItem('dashboard-layout-v8');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return defaultLayout;
}

function WidgetShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-xl overflow-hidden flex flex-col h-full shadow-sm" style={{ background: 'var(--pc-bg-surface)', border: '1px solid var(--pc-border)' }}>
      <div className="widget-drag-handle flex items-center gap-1.5 px-3 py-1 cursor-grab active:cursor-grabbing shrink-0 select-none" style={{ borderBottom: '1px solid var(--pc-border)' }}>
        <GripHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--pc-text-faint)' }} />
        <span className="text-[0.6rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--pc-text-muted)' }}>{title}</span>
      </div>
      <div className="widget-container p-2 flex flex-col flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [layout, setLayout] = useState<any[]>(loadLayout);
  const [refetchSignal, _setRefetchSignal] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const measure = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { window.removeEventListener('resize', measure); observer.disconnect(); };
  }, [measure]);

  // WebSocket connection disabled in ZeroClaw integration
  // TODO: connect to ZeroClaw's SSE event stream instead

  // Fixed cell size — widgets don't shrink with browser.
  // At 1920px, cell = (1920 - 8*11) / 12 = 153px. Use ~150px as the fixed size.
  // If browser is narrower, the grid scrolls horizontally.
  const CELL_SIZE = 150;
  const rowHeight = CELL_SIZE;

  const handleLayoutChange = (newLayout: any[]) => {
    setLayout(newLayout);
    localStorage.setItem('dashboard-layout-v8', JSON.stringify(newLayout));
  };

  const widgetDims = useMemo(() => {
    const map: Record<string, { w: number; h: number; size: ReturnType<typeof getWidgetSize>; orientation: ReturnType<typeof getOrientation>; rowHeightPx: number }> = {};
    for (const item of layout) {
      map[item.i] = { w: item.w, h: item.h, size: getWidgetSize(item.w, item.h), orientation: getOrientation(item.w, item.h), rowHeightPx: rowHeight };
    }
    return map;
  }, [layout, rowHeight]);

  return (
    <div className="flex flex-col h-full">
      <main ref={containerRef} className="flex-1 p-2 overflow-auto">
        {containerWidth > 0 && (
          <GridLayout
            className="w-full"
            layout={layout}
            onLayoutChange={(layout: any) => handleLayoutChange(layout as any[])}
            cols={COLS}
            rowHeight={rowHeight}
            width={Math.max(containerWidth - 8, COLS * CELL_SIZE + (COLS - 1) * GAP)}
            draggableHandle=".widget-drag-handle"
            isDraggable={true}
            isResizable={true}
            compactType="vertical"
            preventCollision={false}
            containerPadding={[4, 4]}
            resizeHandles={['se', 'sw', 'ne', 'nw']}
            margin={[GAP, GAP]}
          >
            <div key="feed"><WidgetShell title="Feed"><NewsFeed key={`f-${refetchSignal}`} dims={widgetDims['feed']} /></WidgetShell></div>
            <div key="digest"><WidgetShell title="Digest"><Digest key={`d-${refetchSignal}`} dims={widgetDims['digest']} /></WidgetShell></div>
            <div key="weather"><WidgetShell title="Weather"><Weather key={`w-${refetchSignal}`} dims={widgetDims['weather']} /></WidgetShell></div>
            <div key="stocks"><WidgetShell title="Stocks"><StockTicker key={`s-${refetchSignal}`} dims={widgetDims['stocks']} /></WidgetShell></div>
            <div key="trending"><WidgetShell title="Trending"><Trending key={`t-${refetchSignal}`} dims={widgetDims['trending']} /></WidgetShell></div>
            <div key="collectors"><WidgetShell title="Collectors"><CollectorStatus key={`c-${refetchSignal}`} dims={widgetDims['collectors']} /></WidgetShell></div>
            <div key="system"><WidgetShell title="System"><SystemMonitor dims={widgetDims['system']} /></WidgetShell></div>
            <div key="calendar"><WidgetShell title="Calendar"><Calendar dims={widgetDims['calendar']} /></WidgetShell></div>
            <div key="zeroclaw"><WidgetShell title="ZeroClaw"><ZeroClawAgent dims={widgetDims['zeroclaw']} /></WidgetShell></div>
            <div key="videos"><WidgetShell title="Videos"><Videos key={`v-${refetchSignal}`} dims={widgetDims['videos']} /></WidgetShell></div>
          </GridLayout>
        )}
      </main>
    </div>
  );
}
