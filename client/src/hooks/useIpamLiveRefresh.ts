/**
 * useIpamLiveRefresh — subscribe to IPAM socket events and call
 * `onRefresh` (debounced) whenever the network state changes.
 *
 * Covers:
 *   - ITEM_STATUS_CHANGED  — device went online/offline
 *   - NEW_DEVICE_DISCOVERED — probe found a new device
 *   - PROBE_STATUS_CHANGED  — probe came online or went offline
 *   - SITE_UPDATED          — site config changed (name, description, group)
 *
 * Multiple events within the debounce window are collapsed into a
 * single reload, so a probe push that transitions 50 devices at once
 * only triggers one HTTP request.
 */

import { useEffect, useRef } from 'react';
import { getSocket } from '../socket/socketClient';
import { SOCKET_EVENTS } from '@oblimap/shared';

const DEBOUNCE_DEFAULT = 1500; // ms

export function useIpamLiveRefresh(
  onRefresh: () => void,
  debounceMs: number = DEBOUNCE_DEFAULT,
): void {
  // Keep a stable ref to the latest callback so the listener closure
  // doesn't become stale after re-renders.
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(), debounceMs);
    };

    socket.on(SOCKET_EVENTS.ITEM_STATUS_CHANGED,   schedule);
    socket.on(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, schedule);
    socket.on(SOCKET_EVENTS.PROBE_STATUS_CHANGED,  schedule);
    socket.on(SOCKET_EVENTS.SITE_UPDATED,           schedule);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      socket.off(SOCKET_EVENTS.ITEM_STATUS_CHANGED,   schedule);
      socket.off(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, schedule);
      socket.off(SOCKET_EVENTS.PROBE_STATUS_CHANGED,  schedule);
      socket.off(SOCKET_EVENTS.SITE_UPDATED,           schedule);
    };
  }, [debounceMs]);
}
