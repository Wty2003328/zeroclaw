import { useRef, useCallback, useState, useEffect } from 'react';
import {
  Zap, Bot, Server, DollarSign, Brain, Search, HeartPulse, Gauge,
} from 'lucide-react';
import GeneralSection from './sections/GeneralSection';
import AgentSection from './sections/AgentSection';
import GatewaySection from './sections/GatewaySection';
import CostSection from './sections/CostSection';
import MemorySection from './sections/MemorySection';
import WebSearchSection from './sections/WebSearchSection';
import HeartbeatSection from './sections/HeartbeatSection';
import PulseConfigSection from './sections/PulseSection';
import { t } from '@/lib/i18n';

interface ConfigFormViewProps {
  config: Record<string, unknown>;
  onUpdate: (path: string, value: unknown) => void;
}

const NAV_ITEMS = [
  { key: 'general', icon: Zap, label: () => t('config.section.general') },
  { key: 'memory', icon: Brain, label: () => t('config.section.memory') },
  { key: 'heartbeat', icon: HeartPulse, label: () => t('config.section.heartbeat') },
  { key: 'web_search', icon: Search, label: () => t('config.section.web_search') },
  { key: 'cost', icon: DollarSign, label: () => t('config.section.cost') },
  { key: 'agent', icon: Bot, label: () => t('config.section.agent') },
  { key: 'gateway', icon: Server, label: () => t('config.section.gateway') },
  { key: 'pulse', icon: Gauge, label: () => 'Pulse Dashboard' },
];

export default function ConfigFormView({ config, onUpdate }: ConfigFormViewProps) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState('general');
  const clickLockRef = useRef(false);

  const scrollTo = useCallback((key: string) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(key);
    // Suppress scroll-based updates while smooth-scroll from click is in progress
    clickLockRef.current = true;
    setTimeout(() => { clickLockRef.current = false; }, 1000);
  }, []);

  const setRef = useCallback((key: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[key] = el;
  }, []);

  // Track which section is visible via scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (clickLockRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const key of NAV_ITEMS.map(n => n.key)) {
        const el = sectionRefs.current[key];
        if (!el) continue;
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < bestDist) { bestDist = dist; best = key; }
      }
      if (best) setActiveSection(best);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [config]);

  return (
    <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
      {/* Section nav sidebar */}
      <nav className="hidden md:flex flex-col gap-1 w-44 flex-shrink-0 pt-1">
        {NAV_ITEMS.map(({ key, icon: Icon, label }) => {
          const isActive = activeSection === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => scrollTo(key)}
              className="config-nav-btn flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left outline-none"
              data-active={isActive ? '' : undefined}
            >
              <Icon className="config-nav-icon h-4 w-4" />
              {label()}
            </button>
          );
        })}
      </nav>

      {/* Scrollable form content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div ref={setRef('general')}>
          <GeneralSection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('memory')}>
          <MemorySection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('heartbeat')}>
          <HeartbeatSection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('web_search')}>
          <WebSearchSection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('cost')}>
          <CostSection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('agent')}>
          <AgentSection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('gateway')}>
          <GatewaySection config={config} onUpdate={onUpdate} />
        </div>
        <div ref={setRef('pulse')}>
          <PulseConfigSection />
        </div>
      </div>
    </div>
  );
}
