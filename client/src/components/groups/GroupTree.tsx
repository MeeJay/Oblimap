import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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

  useEffect(() => {
    fetchTree();
    fetchGroupStats();
    const interval = setInterval(() => {
      fetchGroupStats();
    }, 60000);
    return () => clearInterval(interval);
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
        const hasMatch = (node: typeof n): boolean => {
          if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
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
