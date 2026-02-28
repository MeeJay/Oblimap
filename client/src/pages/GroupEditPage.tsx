import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, FolderTree, Server } from 'lucide-react';
import type { MonitorGroup, GroupTreeNode } from '@obliview/shared';
import { groupsApi } from '@/api/groups.api';
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { GroupPicker } from '@/components/common/GroupPicker';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { NotificationBindingsPanel } from '@/components/notifications/NotificationBindingsPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';

function findNodeById(nodes: GroupTreeNode[], id: number): GroupTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

interface GroupFormData {
  name: string;
  description: string;
  isGeneral: boolean;
  groupNotifications: boolean;
}

export function GroupEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWriteGroup, isAdmin } = useAuthStore();
  const { getGroup, fetchGroups, fetchTree, tree } = useGroupStore();

  const groupId = parseInt(id!, 10);

  const [group, setGroup] = useState<MonitorGroup | null>(getGroup(groupId) ?? null);
  const [loading, setLoading] = useState(!group);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GroupFormData>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    isGeneral: group?.isGeneral ?? false,
    groupNotifications: group?.groupNotifications ?? false,
  });

  // Position state (admin only)
  // undefined = no pending change; null/number = new parent selected but not yet applied
  const [pendingParentId, setPendingParentId] = useState<number | null | undefined>(undefined);
  const [movingSaving, setMovingSaving] = useState(false);
  const [siblingsOrder, setSiblingsOrder] = useState<GroupTreeNode[]>([]);
  const [reorderDirty, setReorderDirty] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);

  const getSiblings = useCallback((): GroupTreeNode[] => {
    if (!group) return [];
    const parentId = group.parentId;
    if (parentId === null) return tree;
    const parentNode = findNodeById(tree, parentId);
    return parentNode?.children ?? [];
  }, [group, tree]);

  // Sync sibling list when group or tree changes
  useEffect(() => {
    setSiblingsOrder(getSiblings());
    setReorderDirty(false);
  }, [getSiblings]);

  // Load group from API if not in store
  useEffect(() => {
    if (!group) {
      groupsApi.getById(groupId)
        .then((g) => {
          setGroup(g);
          setForm({
            name: g.name,
            description: g.description ?? '',
            isGeneral: g.isGeneral,
            groupNotifications: g.groupNotifications,
          });
        })
        .catch(() => toast.error('Failed to load group'))
        .finally(() => setLoading(false));
    }
  }, [groupId, group]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!group || !canWriteGroup(groupId)) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-text-muted">Group not found or access denied</p>
        <Link to="/" className="mt-4">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await groupsApi.update(groupId, {
        name: form.name,
        description: form.description || null,
        isGeneral: form.isGeneral,
        groupNotifications: form.groupNotifications,
      });
      toast.success('Group updated');
      fetchGroups();
      fetchTree();
      navigate(`/group/${groupId}`);
    } catch {
      toast.error('Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async () => {
    if (pendingParentId === undefined) return;
    setMovingSaving(true);
    try {
      await groupsApi.move(groupId, pendingParentId);
      toast.success('Group moved');
      setGroup((g) => g ? { ...g, parentId: pendingParentId } : g);
      setPendingParentId(undefined);
      await fetchGroups();
      await fetchTree();
    } catch {
      toast.error('Failed to move group');
    } finally {
      setMovingSaving(false);
    }
  };

  const moveSibling = (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= siblingsOrder.length) return;
    const newOrder = [...siblingsOrder];
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    setSiblingsOrder(newOrder);
    setReorderDirty(true);
  };

  const handleReorder = async () => {
    setReorderSaving(true);
    try {
      await groupsApi.reorder(siblingsOrder.map((n, idx) => ({ id: n.id, sortOrder: idx })));
      toast.success('Order saved');
      await fetchTree();
      setReorderDirty(false);
    } catch {
      toast.error('Failed to save order');
    } finally {
      setReorderSaving(false);
    }
  };

  const effectiveParentId = pendingParentId !== undefined ? pendingParentId : group.parentId;
  const admin = isAdmin();

  return (
    <div className="p-6 max-w-2xl">
      <Link
        to={`/group/${groupId}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={14} />
        Back to {group.name}
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Edit Group</h1>
        {group.kind === 'agent' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary border border-border px-2.5 py-0.5 text-xs font-medium text-text-muted">
            <Server size={11} />
            Agent Group
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary border border-border px-2.5 py-0.5 text-xs font-medium text-text-muted">
            <FolderTree size={11} />
            Monitor Group
          </span>
        )}
      </div>

      {/* General */}
      <div className="rounded-lg border border-border bg-bg-secondary p-5 mb-6">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">General</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Group name"
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional description"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-general"
              checked={form.isGeneral}
              onChange={(e) => setForm({ ...form, isGeneral: e.target.checked })}
              className="h-4 w-4 rounded border-border bg-bg-tertiary text-accent focus:ring-accent"
            />
            <label htmlFor="is-general" className="text-sm text-text-secondary">
              General group (visible to all users)
            </label>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="group-notifications"
                checked={form.groupNotifications}
                onChange={(e) => setForm({ ...form, groupNotifications: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-bg-tertiary text-accent focus:ring-accent"
              />
              <label htmlFor="group-notifications" className="text-sm text-text-secondary">
                Group notifications
              </label>
            </div>
            <p className="text-xs text-text-muted ml-6">
              Send a single notification when the first monitor goes down, and one recovery when all are back up.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={saving}>Save</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/group/${groupId}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>

      {/* Notification Channels */}
      <div className="mb-6">
        <NotificationBindingsPanel
          scope="group"
          scopeId={groupId}
          title="Notification Channels"
        />
      </div>

      {/* Monitor Settings */}
      <div className="mb-6">
        <SettingsPanel
          scope="group"
          scopeId={groupId}
          title="Monitor Settings"
        />
      </div>

      {/* Position (admin only) */}
      {admin && (
        <div className="rounded-lg border border-border bg-bg-secondary p-5 mb-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Position</h2>

          {/* Parent group */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-text-secondary mb-1">Parent Group</label>
            <GroupPicker
              value={effectiveParentId}
              onChange={(pid) => setPendingParentId(pid === group.parentId ? undefined : pid)}
              tree={tree}
              placeholder="None (root level)"
              excludeId={groupId}
            />
            {pendingParentId !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" onClick={handleMove} loading={movingSaving}>
                  Apply move
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPendingParentId(undefined)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Sibling order */}
          {siblingsOrder.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Order among siblings
              </label>
              <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
                {siblingsOrder.map((sibling, idx) => (
                  <div
                    key={sibling.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm',
                      sibling.id === groupId
                        ? 'bg-accent/5 text-text-primary font-medium'
                        : 'text-text-secondary',
                    )}
                  >
                    <span className="w-5 shrink-0 text-right text-xs text-text-muted">{idx + 1}</span>
                    <span className="flex-1 truncate">{sibling.name}</span>
                    {sibling.id === groupId && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveSibling(idx, -1)}
                          disabled={idx === 0}
                          className="rounded p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSibling(idx, 1)}
                          disabled={idx === siblingsOrder.length - 1}
                          className="rounded p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {reorderDirty && (
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={handleReorder} loading={reorderSaving}>
                    Save order
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setSiblingsOrder(getSiblings()); setReorderDirty(false); }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
