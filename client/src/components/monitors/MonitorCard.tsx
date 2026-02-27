import { Link } from 'react-router-dom';
import type { Monitor, Heartbeat } from '@obliview/shared';
import { MONITOR_TYPE_LABELS } from '@obliview/shared';
import { MonitorStatusBadge } from './MonitorStatusBadge';
import { HeartbeatBar } from './HeartbeatBar';
import { MiniSparkline } from './MiniSparkline';
import { cn } from '@/utils/cn';

interface MonitorCardProps {
  monitor: Monitor;
  heartbeats: Heartbeat[];
  selected?: boolean;
  onSelect?: (id: number) => void;
  selectionMode?: boolean;
}

export function MonitorCard({
  monitor,
  heartbeats,
  selected,
  onSelect,
  selectionMode,
}: MonitorCardProps) {
  const lastHeartbeat = heartbeats[heartbeats.length - 1];
  const responseTime = lastHeartbeat?.responseTime;
  const isValueWatcher = monitor.type === 'value_watcher';
  const watchedValue = lastHeartbeat?.value;

  /** Format a numeric string with locale grouping (e.g. 1000000 → 1,000,000) */
  const formatValue = (val: string) => {
    const num = Number(val);
    if (!isNaN(num)) return num.toLocaleString();
    return val;
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border p-3 transition-colors',
        'hover:bg-bg-hover hover:border-border-light',
        selected && 'border-accent bg-bg-tertiary',
        selectionMode && 'cursor-pointer',
      )}
      onClick={selectionMode ? () => onSelect?.(monitor.id) : undefined}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect?.(monitor.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-border bg-bg-tertiary text-accent focus:ring-accent"
        />
      )}

      <Link
        to={`/monitor/${monitor.id}`}
        className="flex flex-1 items-center gap-3 min-w-0"
        onClick={selectionMode ? (e) => e.preventDefault() : undefined}
      >
        <MonitorStatusBadge status={monitor.status} size="sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-text-primary text-sm">
              {monitor.name}
            </span>
            <span className="text-xs text-text-muted">
              {MONITOR_TYPE_LABELS[monitor.type]}
            </span>
          </div>

          <div className="mt-1">
            <HeartbeatBar heartbeats={heartbeats} />
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 sm:shrink sm:flex-1 sm:max-w-[280px]">
          <MiniSparkline heartbeats={heartbeats} monitor={monitor} />
          {isValueWatcher ? (
            watchedValue != null && (
              <div className="text-right">
                <span className="text-sm font-mono font-semibold text-accent">
                  {formatValue(watchedValue)}
                </span>
              </div>
            )
          ) : (
            responseTime !== undefined && responseTime !== null && (
              <div className="text-right">
                <span className="text-sm font-mono text-text-secondary">
                  {responseTime}ms
                </span>
              </div>
            )
          )}
        </div>
      </Link>
    </div>
  );
}
