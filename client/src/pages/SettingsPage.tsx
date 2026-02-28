import { SettingsPanel } from '@/components/settings/SettingsPanel';

export function SettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">Global Settings</h1>
      <p className="text-sm text-text-muted mb-6">
        These defaults apply to all groups and monitors unless overridden at a lower level.
      </p>
      <SettingsPanel scope="global" scopeId={null} title="Default Settings" />
    </div>
  );
}
