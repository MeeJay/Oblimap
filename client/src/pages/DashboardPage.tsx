import { useAuthStore } from '@/store/authStore';
import { MapPin, Cpu, Radar, LayoutDashboard } from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard size={24} className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Oblimap Dashboard</h1>
          {user && (
            <p className="text-sm text-text-secondary mt-0.5">
              Welcome back, {user.displayName || user.username}
            </p>
          )}
        </div>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {/* Total Sites */}
        <div className="rounded-lg border border-border bg-bg-secondary p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <MapPin size={20} className="text-accent" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Total Sites</p>
            <p className="text-2xl font-bold text-text-primary mt-0.5">0</p>
          </div>
        </div>

        {/* Total Devices */}
        <div className="rounded-lg border border-border bg-bg-secondary p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
            <Cpu size={20} className="text-green-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Total Devices</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-2xl font-bold text-text-primary">0</p>
              <span className="text-xs text-text-muted">online / 0 offline</span>
            </div>
          </div>
        </div>

        {/* Active Probes */}
        <div className="rounded-lg border border-border bg-bg-secondary p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Radar size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Active Probes</p>
            <p className="text-2xl font-bold text-text-primary mt-0.5">0</p>
          </div>
        </div>
      </div>

      {/* Placeholder content */}
      <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
        <MapPin size={32} className="mx-auto mb-3 text-text-muted" />
        <p className="text-text-secondary text-sm font-medium">No sites configured yet</p>
        <p className="text-text-muted text-xs mt-1">Sites will appear here once configured</p>
      </div>
    </div>
  );
}
