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

  const scrollTo = useCallback((key: string) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(key);
  }, []);

  const setRef = useCallback((key: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[key] = el;
  }, []);

  // Track which section is visible via IntersectionObserver
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            const key = entry.target.getAttribute('data-section');
            if (key) setActiveSection(key);
          }
        }
      },
      { root: container, threshold: 0.3 }
    );

    for (const [key, el] of Object.entries(sectionRefs.current)) {
      if (el) {
        el.setAttribute('data-section', key);
        observer.observe(el);
      }
    }

    return () => observer.disconnect();
  }, [config]); // re-observe when config loads

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
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left outline-none"
              style={{
                color: isActive ? 'var(--pc-accent-light)' : 'var(--pc-text-secondary)',
                background: isActive ? 'var(--pc-accent-glow)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--pc-bg-elevated)';
                  e.currentTarget.style.color = 'var(--pc-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--pc-text-secondary)';
                }
              }}
            >
              <Icon className="h-4 w-4" style={{ color: isActive ? 'var(--pc-accent)' : 'var(--pc-accent-dim)' }} />
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
