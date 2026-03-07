import { create } from 'zustand';

export type AlertSeverity = 'down' | 'up' | 'warning' | 'info';

export interface LiveAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  navigateTo?: string;
  createdAt: number;
}

interface LiveAlertsState {
  alerts: LiveAlert[];
  unreadCount: number;
  enabled: boolean;
  position: 'top-center' | 'bottom-right';
  setEnabled: (v: boolean) => void;
  setPosition: (p: 'top-center' | 'bottom-right') => void;
  addAlert: (alert: Omit<LiveAlert, 'id' | 'createdAt'>) => void;
  removeAlert: (id: string) => void;
  clearAll: () => void;
  markAllRead: () => void;
}

export const useLiveAlertsStore = create<LiveAlertsState>((set) => ({
  alerts: [],
  unreadCount: 0,
  enabled: true,
  position: 'bottom-right',
  setEnabled: (v) => set({ enabled: v }),
  setPosition: (p) => set({ position: p }),
  addAlert: (alert) =>
    set((s) => ({
      alerts: [
        { ...alert, id: crypto.randomUUID(), createdAt: Date.now() },
        ...s.alerts,
      ].slice(0, 50),
      unreadCount: s.unreadCount + 1,
    })),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAll: () => set({ alerts: [], unreadCount: 0 }),
  markAllRead: () => set({ unreadCount: 0 }),
}));
