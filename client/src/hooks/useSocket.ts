import { useEffect, useRef } from 'react';
import { getSocket } from '../socket/socketClient';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import { useLiveAlertsStore } from '../store/liveAlertsStore';
import { SOCKET_EVENTS } from '@oblimap/shared';
import type { MonitorGroup, LiveAlertData } from '@oblimap/shared';

/** Dispatch a sound notification to the native desktop app overlay. */
function notifyNative(type: 'probe_down' | 'probe_up' | 'agent_alert' | 'agent_fixed') {
  window.dispatchEvent(new CustomEvent('obliview:notify', { detail: { type } }));
}

export function useSocket() {
  const { user } = useAuthStore();
  const { addGroup, updateGroup, removeGroup, fetchTree } = useGroupStore();

  // Track previous agent statuses to detect transitions (alert↔ok) for native sounds.
  const agentStatusRef = useRef<Map<number, string>>(new Map());

  const isNativeApp = typeof window !== 'undefined' && !!(window as Window & { __obliview_is_native_app?: boolean }).__obliview_is_native_app;

  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    if (!socket) return;

    // ── Live alert (NOTIFICATION_NEW) ─────────────────────────────────────────
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, (alert: LiveAlertData) => {
      useLiveAlertsStore.getState().addAlertFromServer(alert);
    });

    // ── Group events ──────────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.GROUP_CREATED, (data: { group: MonitorGroup }) => {
      addGroup(data.group);
      fetchTree();
    });
    socket.on(SOCKET_EVENTS.GROUP_UPDATED, (data: { group: MonitorGroup }) => {
      updateGroup(data.group.id, data.group);
      fetchTree();
    });
    socket.on(SOCKET_EVENTS.GROUP_DELETED, (data: { groupId: number }) => {
      removeGroup(data.groupId);
      fetchTree();
    });
    socket.on(SOCKET_EVENTS.GROUP_MOVED, (data: { group: MonitorGroup }) => {
      updateGroup(data.group.id, data.group);
      fetchTree();
    });

    // ── Agent status — native sounds ─────────────────────────────────────────
    socket.on(SOCKET_EVENTS.AGENT_STATUS_CHANGED, (data: {
      deviceId: number;
      status: string;
    }) => {
      const prev = agentStatusRef.current.get(data.deviceId);

      if (isNativeApp) {
        if (data.status === 'alert' && prev !== 'alert') {
          notifyNative('agent_alert');
        } else if (prev === 'alert' && data.status !== 'alert') {
          notifyNative('agent_fixed');
        }
      }

      agentStatusRef.current.set(data.deviceId, data.status);
    });

    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW);
      socket.off(SOCKET_EVENTS.GROUP_CREATED);
      socket.off(SOCKET_EVENTS.GROUP_UPDATED);
      socket.off(SOCKET_EVENTS.GROUP_DELETED);
      socket.off(SOCKET_EVENTS.GROUP_MOVED);
      socket.off(SOCKET_EVENTS.AGENT_STATUS_CHANGED);
    };
  }, [user, addGroup, updateGroup, removeGroup, fetchTree, isNativeApp]);
}
