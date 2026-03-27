import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { SOCKET_EVENTS } from '@oblimap/shared';
import { getSocket } from '@/socket/socketClient';
import { useGroupStore } from '@/store/groupStore';
import { GroupNode } from './GroupNode';

interface GroupTreeProps {
  selectedGroupId?: number | null;
  onSelectGroup?: (groupId: number | null) => void;
  searchQuery?: string;
}

export function GroupTree({ selectedGroupId, onSelectGroup, searchQuery = '' }: GroupTreeProps) {
  const { tree, fetchTree, fetchGroupStats, expandAncestors } = useGroupStore();
  const location = useLocation();

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTree();
    fetchGroupStats();
    const interval = setInterval(() => {
      fetchGroupStats();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchTree, fetchGroupStats]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        fetchTree();
        fetchGroupStats();
      }, 1500);
    };

    socket.on(SOCKET_EVENTS.SITE_UPDATED, scheduleRefresh);
    socket.on(SOCKET_EVENTS.ITEM_STATUS_CHANGED, scheduleRefresh);
    socket.on(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, scheduleRefresh);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      socket.off(SOCKET_EVENTS.SITE_UPDATED, scheduleRefresh);
      socket.off(SOCKET_EVENTS.ITEM_STATUS_CHANGED, scheduleRefresh);
      socket.off(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, scheduleRefresh);
    };
  }, [fetchTree, fetchGroupStats]);

  // Auto-expand ancestors when navigating to a group detail page
  useEffect(() => {
    const match = location.pathname.match(/^\/group\/(\d+)$/);
    if (match) {
      const groupId = Number(match[1]);
      expandAncestors(groupId);
    }
  }, [location.pathname, expandAncestors]);

  const visibleTree = searchQuery
    ? tree.filter(n => {
        const q = searchQuery.toLowerCase();
        const hasMatch = (node: typeof n): boolean => {
          if (node.name.toLowerCase().includes(q)) return true;
          if (node.sites?.some(s => s.name.toLowerCase().includes(q))) return true;
          return node.children.some(hasMatch);
        };
        return hasMatch(n);
      })
    : tree;

  if (visibleTree.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-text-muted">
        {searchQuery ? 'No matching groups' : 'No groups yet'}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {visibleTree.map((node) => (
        <GroupNode
          key={node.id}
          node={node}
          selectedGroupId={selectedGroupId}
          onSelectGroup={onSelectGroup}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}
