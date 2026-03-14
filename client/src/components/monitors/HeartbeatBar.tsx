/** HeartbeatBar — stub component for Oblimap IPAM conversion. */
interface HeartbeatBarProps {
  heartbeats?: unknown[];
  [key: string]: unknown;
}

export function HeartbeatBar(_props: HeartbeatBarProps) {
  return null;
}

/** Estimate the maximum number of heartbeat bars that fit the current viewport. */
export function estimateMaxBars(): number {
  return 60;
}
