import { DataSourcesPanel } from '@/components/pulse/settings/DataSourcesPanel';
import { ModelsPanel } from '@/components/pulse/settings/ModelsPanel';
import { Gauge } from 'lucide-react';

function toast(msg: string, type: 'success' | 'error') {
  // Simple toast via console for now
  console.log(`[Pulse ${type}] ${msg}`);
}

export default function PulseSection() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Gauge className="h-5 w-5" style={{ color: 'var(--pc-accent)' }} />
        <h3 className="text-base font-semibold" style={{ color: 'var(--pc-text-primary)' }}>
          Pulse Dashboard
        </h3>
      </div>
      <p className="text-sm" style={{ color: 'var(--pc-text-muted)' }}>
        Configure data sources and AI providers for the Pulse personal intelligence dashboard.
      </p>

      <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}>
        <DataSourcesPanel onToast={toast} />
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}>
        <ModelsPanel onToast={toast} />
      </div>
    </div>
  );
}
