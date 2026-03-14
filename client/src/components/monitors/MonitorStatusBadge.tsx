/** MonitorStatusBadge — stub component for Oblimap IPAM conversion. */
interface MonitorStatusBadgeProps {
  status?: string;
  size?: 'sm' | 'md' | 'lg';
  inMaintenance?: boolean;
  [key: string]: unknown;
}

export function MonitorStatusBadge({ status, size: _size, inMaintenance: _inMaintenance }: MonitorStatusBadgeProps) {
  const colorMap: Record<string, string> = {
    up: 'bg-green-500',
    down: 'bg-red-500',
    alert: 'bg-orange-500',
    paused: 'bg-gray-400',
    pending: 'bg-yellow-500',
  };
  const dot = colorMap[status ?? ''] ?? 'bg-gray-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />;
}
