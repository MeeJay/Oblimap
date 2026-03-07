import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useLiveAlertsStore } from '@/store/liveAlertsStore';
import type { LiveAlert, AlertSeverity } from '@/store/liveAlertsStore';
import { cn } from '@/utils/cn';

const SEVERITY_STYLES: Record<AlertSeverity, { bar: string; title: string }> = {
  down:    { bar: 'border-l-red-500',   title: 'text-red-400'   },
  up:      { bar: 'border-l-green-500', title: 'text-green-400' },
  warning: { bar: 'border-l-amber-500', title: 'text-amber-400' },
  info:    { bar: 'border-l-blue-500',  title: 'text-blue-400'  },
};

// Auto-dismiss durations per position mode
const DISMISS_BOTTOM_RIGHT_MS = 60_000;
const DISMISS_TOP_CENTER_MS   = 10_000;

// ─── Single toast card ───────────────────────────────────────────────────────

interface AlertCardProps {
  alert: LiveAlert;
  opacity?: number;
  autoDismissMs: number;
}

function AlertCard({ alert, opacity = 1, autoDismissMs }: AlertCardProps) {
  const { removeAlert } = useLiveAlertsStore();
  const navigate = useNavigate();
  const styles = SEVERITY_STYLES[alert.severity];

  // Auto-dismiss timer
  useEffect(() => {
    const timer = setTimeout(() => removeAlert(alert.id), autoDismissMs);
    return () => clearTimeout(timer);
  }, [alert.id, autoDismissMs, removeAlert]);

  const handleCardClick = () => {
    if (alert.navigateTo) {
      navigate(alert.navigateTo);
    }
  };

  return (
    <div
      className={cn(
        'relative flex items-stretch rounded-xl border border-border/50 backdrop-blur-md bg-bg-secondary/80 shadow-lg overflow-hidden transition-opacity duration-300',
        alert.navigateTo && 'cursor-pointer hover:bg-bg-secondary/90',
        `border-l-4 ${styles.bar}`,
      )}
      style={{ opacity }}
      onClick={handleCardClick}
    >
      <div className="flex-1 p-3 pr-8 min-w-0">
        <p className={cn('text-sm font-semibold leading-tight truncate', styles.title)}>
          {alert.title}
        </p>
        <p className="text-xs text-text-muted mt-0.5 leading-snug line-clamp-2">
          {alert.message}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        className="absolute top-2 right-2 text-text-muted hover:text-text-primary transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          removeAlert(alert.id);
        }}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Auto-dismiss wrapper for top-center (tracks alert.id change) ─────────────

interface TopCenterAlertProps {
  alert: LiveAlert;
}

function TopCenterAlert({ alert }: TopCenterAlertProps) {
  const { removeAlert } = useLiveAlertsStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => removeAlert(alert.id), DISMISS_TOP_CENTER_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alert.id, removeAlert]);

  return <AlertCard alert={alert} autoDismissMs={DISMISS_TOP_CENTER_MS} />;
}

// ─── Main LiveAlerts renderer ─────────────────────────────────────────────────

export function LiveAlerts() {
  const { alerts, enabled, position } = useLiveAlertsStore();

  if (!enabled || alerts.length === 0) return null;

  if (position === 'top-center') {
    // Only show the newest alert
    const latest = alerts[0];
    return (
      <div
        className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[400px] max-w-[calc(100vw-2rem)] animate-fade-in"
      >
        <TopCenterAlert key={latest.id} alert={latest} />
      </div>
    );
  }

  // bottom-right: show up to 10, newest at bottom, older stacked above
  const visible = alerts.slice(0, 10);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {visible.map((alert, index) => {
        // index 0 = newest (at bottom), gets full opacity
        // older ones get progressively less opacity
        const opacity = Math.max(0.4, 1 - index * 0.15);
        return (
          <AlertCard
            key={alert.id}
            alert={alert}
            opacity={opacity}
            autoDismissMs={DISMISS_BOTTOM_RIGHT_MS}
          />
        );
      })}
    </div>
  );
}
