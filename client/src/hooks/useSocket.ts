import { useEffect, useRef } from 'react';
import { getSocket } from '../socket/socketClient';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import { useLiveAlertsStore } from '../store/liveAlertsStore';
import { SOCKET_EVENTS } from '@oblimap/shared';
import type { MonitorGroup, LiveAlertData } from '@oblimap/shared';

/** Dispatch a sound notification to the native desktop app overlay. */
function notifyNative(type: 'probe_down' | 'probe_up' | 'agent_alert' | 'agent_fixed') {
  window.dispatchEvent(new CustomEvent('oblimap:notify', { detail: { type } }));
}

export function useSocket() {
  const { user } = useAuthStore();
  const { addGroup, updateGroup, removeGroup, fetchTree } = useGroupStore();

  // Track previous agent statuses to detect transitions (alert↔ok) for native sounds.
  const agentStatusRef = useRef<Map<number, string>>(new Map());

  const isNativeApp = typeof window !== 'undefined' && !!(window as Window & { __oblimap_is_native_app?: boolean }).__oblimap_is_native_app;

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

    // ── Probe status — native sounds ──────────────────────────────────────────
    socket.on(SOCKET_EVENTS.PROBE_STATUS_CHANGED, (data: {
      probeId: number;
      status: string;
    }) => {
      const prev = agentStatusRef.current.get(data.probeId);

      if (isNativeApp) {
        // Probe went offline → alert sound
        if (data.status === 'offline' && prev !== 'offline') {
          notifyNative('probe_down');
        }
        // Probe recovered (was offline, now sending data again)
        else if (prev === 'offline' && data.status !== 'offline') {
          notifyNative('probe_up');
        }
      }

      agentStatusRef.current.set(data.probeId, data.status);
    });

    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW);
      socket.off(SOCKET_EVENTS.GROUP_CREATED);
      socket.off(SOCKET_EVENTS.GROUP_UPDATED);
      socket.off(SOCKET_EVENTS.GROUP_DELETED);
      socket.off(SOCKET_EVENTS.GROUP_MOVED);
      socket.off(SOCKET_EVENTS.PROBE_STATUS_CHANGED);
    };
  }, [user, addGroup, updateGroup, removeGroup, fetchTree, isNativeApp]);
}
