import { useState, useEffect, type FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Key,
  Shield,
  UserIcon,
  UserX,
  Users,
  FolderOpen,
  Monitor,
  Check,
  ChevronRight,
  ChevronDown,
  Eye,
} from 'lucide-react';
import type {
  User,
  UserTeam,
  TeamPermission,
  GroupTreeNode,
  Monitor as MonitorType,
  PermissionLevel,
  PermissionScope,
} from '@obliview/shared';
import { usersApi } from '@/api/users.api';
import { teamsApi } from '@/api/teams.api';
import { groupsApi } from '@/api/groups.api';
import { monitorsApi } from '@/api/monitors.api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import toast from 'react-hot-toast';

type Tab = 'users' | 'teams';
type UserFormMode = 'create' | 'edit' | 'password' | null;
type TeamFormMode = 'create' | 'edit' | null;

export function AdminUsersPage() {
  const { user: currentUser } = useAuthStore();
  const [tab, setTab] = useState<Tab>('users');

  // Data
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<UserTeam[]>([]);
  const [tree, setTree] = useState<GroupTreeNode[]>([]);
  const [monitors, setMonitors] = useState<MonitorType[]>([]);

  // User form
  const [userFormMode, setUserFormMode] = useState<UserFormMode>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user'>('user');
  const [saving, setSaving] = useState(false);

  // Team form
  const [teamFormMode, setTeamFormMode] = useState<TeamFormMode>(null);
  const [editingTeam, setEditingTeam] = useState<UserTeam | null>(null);
  const [formTeamName, setFormTeamName] = useState('');
  const [formTeamDesc, setFormTeamDesc] = useState('');
  const [formCanCreate, setFormCanCreate] = useState(false);

  // Selected team for right panel
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<number[]>([]);
  const [teamPermissions, setTeamPermissions] = useState<TeamPermission[]>([]);
  const [rightTab, setRightTab] = useState<'members' | 'permissions'>('members');

  const load = async () => {
    try {
      const [u, t, tr, m] = await Promise.all([
        usersApi.list(),
        teamsApi.list(),
        groupsApi.tree(),
        monitorsApi.list(),
      ]);
      setUsers(u);
      setTeams(t);
      setTree(tr);
      setMonitors(m);
    } catch {
      toast.error('Failed to load data');
    }
  };

  useEffect(() => { load(); }, []);

  const loadTeamDetails = async (teamId: number) => {
    try {
      const detail = await teamsApi.getById(teamId);
      setTeamMembers(detail.memberIds);
      setTeamPermissions(detail.permissions);
    } catch {
      toast.error('Failed to load team details');
    }
  };

  const selectTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
    loadTeamDetails(teamId);
  };

  // ── User form handlers ──

  const resetUserForm = () => {
    setUserFormMode(null);
    setEditingUser(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('user');
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await usersApi.create({
        username: formUsername,
        password: formPassword,
        displayName: formDisplayName || undefined,
        role: formRole,
      });
      toast.success('User created');
      resetUserForm();
      load();
    } catch {
      toast.error('Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      await usersApi.update(editingUser.id, {
        username: formUsername,
        displayName: formDisplayName || null,
        role: formRole,
      });
      toast.success('User updated');
      resetUserForm();
      load();
    } catch {
      toast.error('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      await usersApi.changePassword(editingUser.id, formPassword);
      toast.success('Password changed');
      resetUserForm();
    } catch {
      toast.error('Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete user "${user.username}"?`)) return;
    try {
      await usersApi.delete(user.id);
      toast.success('User deleted');
      load();
    } catch {
      toast.error('Failed to delete user');
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? 'User disabled' : 'User enabled');
      load();
    } catch {
      toast.error('Failed to update user');
    }
  };

  // ── Team form handlers ──

  const resetTeamForm = () => {
    setTeamFormMode(null);
    setEditingTeam(null);
    setFormTeamName('');
    setFormTeamDesc('');
    setFormCanCreate(false);
  };

  const handleCreateTeam = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const team = await teamsApi.create({
        name: formTeamName,
        description: formTeamDesc || null,
        canCreate: formCanCreate,
      });
      toast.success('Team created');
      resetTeamForm();
      load();
      selectTeam(team.id);
    } catch {
      toast.error('Failed to create team');
    } finally {
      setSaving(false);
    }
  };

  const handleEditTeam = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;
    setSaving(true);
    try {
      await teamsApi.update(editingTeam.id, {
        name: formTeamName,
        description: formTeamDesc || null,
        canCreate: formCanCreate,
      });
      toast.success('Team updated');
      resetTeamForm();
      load();
    } catch {
      toast.error('Failed to update team');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (team: UserTeam) => {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    try {
      await teamsApi.delete(team.id);
      toast.success('Team deleted');
      if (selectedTeamId === team.id) setSelectedTeamId(null);
      load();
    } catch {
      toast.error('Failed to delete team');
    }
  };

  // ── Members management ──

  const toggleMember = async (userId: number) => {
    if (!selectedTeamId) return;
    const newMembers = teamMembers.includes(userId)
      ? teamMembers.filter((id) => id !== userId)
      : [...teamMembers, userId];
    try {
      await teamsApi.setMembers(selectedTeamId, { userIds: newMembers });
      setTeamMembers(newMembers);
    } catch {
      toast.error('Failed to update members');
    }
  };

  // ── Permissions management ──

  const addPermission = async (scope: PermissionScope, scopeId: number, level: PermissionLevel) => {
    if (!selectedTeamId) return;
    const existing = teamPermissions.find((p) => p.scope === scope && p.scopeId === scopeId);
    if (existing) {
      // Update level
      const newPerms = teamPermissions.map((p) =>
        p.id === existing.id ? { ...p, level } : p,
      );
      try {
        await teamsApi.setPermissions(selectedTeamId, {
          permissions: newPerms.map((p) => ({ scope: p.scope, scopeId: p.scopeId, level: p.level })),
        });
        await loadTeamDetails(selectedTeamId);
      } catch {
        toast.error('Failed to update permission');
      }
    } else {
      // Add new
      const newPerms = [
        ...teamPermissions.map((p) => ({ scope: p.scope, scopeId: p.scopeId, level: p.level })),
        { scope, scopeId, level },
      ];
      try {
        await teamsApi.setPermissions(selectedTeamId, { permissions: newPerms });
        await loadTeamDetails(selectedTeamId);
      } catch {
        toast.error('Failed to add permission');
      }
    }
  };

  const removePermission = async (permId: number) => {
    if (!selectedTeamId) return;
    try {
      await teamsApi.removePermission(selectedTeamId, permId);
      setTeamPermissions((prev) => prev.filter((p) => p.id !== permId));
    } catch {
      toast.error('Failed to remove permission');
    }
  };

  const togglePermissionLevel = async (perm: TeamPermission) => {
    const newLevel: PermissionLevel = perm.level === 'ro' ? 'rw' : 'ro';
    await addPermission(perm.scope, perm.scopeId, newLevel);
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  // Build sets for quick lookup
  const assignedGroupIds = new Set(teamPermissions.filter((p) => p.scope === 'group').map((p) => p.scopeId));
  const assignedMonitorIds = new Set(teamPermissions.filter((p) => p.scope === 'monitor').map((p) => p.scopeId));

  // Collect all descendant group IDs covered by a group permission (implicit coverage)
  const coveredGroupIds = new Set<number>();
  const coveredByGroupId = new Map<number, number>(); // descendant → assigned ancestor
  const collectDescendants = (nodes: GroupTreeNode[], coveredBy: number | null) => {
    for (const node of nodes) {
      const directlyAssigned = assignedGroupIds.has(node.id);
      const effectiveCover = directlyAssigned ? node.id : coveredBy;
      if (coveredBy && !directlyAssigned) {
        coveredGroupIds.add(node.id);
        coveredByGroupId.set(node.id, coveredBy);
      }
      collectDescendants(node.children, effectiveCover);
      // Monitors inside a covered group are implicitly covered
      if (effectiveCover) {
        for (const m of monitors.filter((mon) => mon.groupId === node.id)) {
          if (!assignedMonitorIds.has(m.id)) {
            coveredByGroupId.set(-m.id, effectiveCover); // negative = monitor
          }
        }
      }
    }
  };
  collectDescendants(tree, null);

  // Merge monitors into tree nodes for display
  const monitorsByGroup = new Map<number, MonitorType[]>();
  const ungroupedMonitors: MonitorType[] = [];
  for (const m of monitors) {
    if (m.groupId) {
      if (!monitorsByGroup.has(m.groupId)) monitorsByGroup.set(m.groupId, []);
      monitorsByGroup.get(m.groupId)!.push(m);
    } else {
      ungroupedMonitors.push(m);
    }
  }

  // Get permission for a group/monitor
  const getGroupPerm = (groupId: number) => teamPermissions.find((p) => p.scope === 'group' && p.scopeId === groupId);
  const getMonitorPerm = (monitorId: number) => teamPermissions.find((p) => p.scope === 'monitor' && p.scopeId === monitorId);

  return (
    <div className="flex gap-6 p-6 h-full justify-center max-w-5xl min-w-0 mx-auto w-full">
      {/* Left panel */}
      <div className="flex-1 min-w-0 max-w-xl">
        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-4 rounded-lg bg-bg-secondary p-1 border border-border">
          <button
            onClick={() => setTab('users')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'users'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <UserIcon size={14} className="inline mr-1.5" />
            Users
          </button>
          <button
            onClick={() => setTab('teams')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'teams'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Users size={14} className="inline mr-1.5" />
            Teams
          </button>
        </div>

        {/* ── Users Tab ── */}
        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Users</h2>
              <Button size="sm" onClick={() => { resetUserForm(); setUserFormMode('create'); }}>
                <Plus size={14} className="mr-1" />New
              </Button>
            </div>

            {/* User form */}
            {(userFormMode === 'create' || userFormMode === 'edit') && (
              <div className="mb-4 rounded-lg border border-border bg-bg-secondary p-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
                  {userFormMode === 'create' ? 'New User' : `Edit: ${editingUser?.username}`}
                </h3>
                <form onSubmit={userFormMode === 'create' ? handleCreateUser : handleEditUser} className="space-y-3">
                  <Input label="Username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} required pattern="[a-zA-Z0-9_.\-]+" />
                  <Input label="Display Name" value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} />
                  {userFormMode === 'create' && (
                    <Input label="Password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} />
                  )}
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-text-secondary">Role</label>
                    <select value={formRole} onChange={(e) => setFormRole(e.target.value as 'admin' | 'user')}
                      className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={saving}>{userFormMode === 'create' ? 'Create' : 'Save'}</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={resetUserForm}>Cancel</Button>
                  </div>
                </form>
              </div>
            )}

            {userFormMode === 'password' && editingUser && (
              <div className="mb-4 rounded-lg border border-border bg-bg-secondary p-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
                  Password: {editingUser.username}
                </h3>
                <form onSubmit={handlePasswordChange} className="space-y-3">
                  <Input label="New Password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={saving}>Change</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={resetUserForm}>Cancel</Button>
                  </div>
                </form>
              </div>
            )}

            {/* User list */}
            <div className="rounded-lg border border-border bg-bg-secondary divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-2 px-3 py-2.5 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{user.username}</span>
                      {user.displayName && <span className="text-xs text-text-muted">({user.displayName})</span>}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        user.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-bg-tertiary text-text-muted'
                      }`}>
                        {user.role === 'admin' ? <><Shield size={10} className="inline mr-0.5" />Admin</> : 'User'}
                      </span>
                      {!user.isActive && (
                        <span className="rounded-full bg-status-down/10 px-1.5 py-0.5 text-[10px] font-medium text-status-down">Off</span>
                      )}
                    </div>
                  </div>
                  {user.id !== currentUser?.id && (
                    <>
                      <button onClick={() => { setEditingUser(user); setFormPassword(''); setUserFormMode('password'); }}
                        className="shrink-0 p-1 text-text-muted hover:text-accent opacity-0 group-hover:opacity-100" title="Password">
                        <Key size={13} />
                      </button>
                      <button onClick={() => handleToggleActive(user)}
                        className="shrink-0 p-1 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100" title={user.isActive ? 'Disable' : 'Enable'}>
                        {user.isActive ? <UserX size={13} /> : <UserIcon size={13} />}
                      </button>
                    </>
                  )}
                  <button onClick={() => { setEditingUser(user); setFormUsername(user.username); setFormDisplayName(user.displayName || ''); setFormRole(user.role); setUserFormMode('edit'); }}
                    className="shrink-0 p-1 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100" title="Edit">
                    <Pencil size={13} />
                  </button>
                  {user.id !== currentUser?.id && (
                    <button onClick={() => handleDeleteUser(user)}
                      className="shrink-0 p-1 text-text-muted hover:text-status-down opacity-0 group-hover:opacity-100" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Teams Tab ── */}
        {tab === 'teams' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Teams</h2>
              <Button size="sm" onClick={() => { resetTeamForm(); setTeamFormMode('create'); }}>
                <Plus size={14} className="mr-1" />New
              </Button>
            </div>

            {/* Team form */}
            {(teamFormMode === 'create' || teamFormMode === 'edit') && (
              <div className="mb-4 rounded-lg border border-border bg-bg-secondary p-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
                  {teamFormMode === 'create' ? 'New Team' : `Edit: ${editingTeam?.name}`}
                </h3>
                <form onSubmit={teamFormMode === 'create' ? handleCreateTeam : handleEditTeam} className="space-y-3">
                  <Input label="Name" value={formTeamName} onChange={(e) => setFormTeamName(e.target.value)} required />
                  <Input label="Description" value={formTeamDesc} onChange={(e) => setFormTeamDesc(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                    <input type="checkbox" checked={formCanCreate} onChange={(e) => setFormCanCreate(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent" />
                    Can create monitors & groups
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={saving}>{teamFormMode === 'create' ? 'Create' : 'Save'}</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={resetTeamForm}>Cancel</Button>
                  </div>
                </form>
              </div>
            )}

            {/* Team list */}
            <div className="rounded-lg border border-border bg-bg-secondary divide-y divide-border">
              {teams.length === 0 ? (
                <div className="py-8 text-center">
                  <Users size={28} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-sm text-text-muted">No teams created yet</p>
                </div>
              ) : (
                teams.map((team) => (
                  <div
                    key={team.id}
                    onClick={() => selectTeam(team.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer group transition-colors ${
                      selectedTeamId === team.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <Users size={14} className="shrink-0 text-text-muted" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-text-primary">{team.name}</span>
                      {team.canCreate && (
                        <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          Create
                        </span>
                      )}
                      {team.description && (
                        <p className="text-xs text-text-muted truncate">{team.description}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTeam(team); setFormTeamName(team.name); setFormTeamDesc(team.description || ''); setFormCanCreate(team.canCreate); setTeamFormMode('edit'); }}
                      className="shrink-0 p-1 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team); }}
                      className="shrink-0 p-1 text-text-muted hover:text-status-down opacity-0 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
                    <ChevronRight size={14} className="shrink-0 text-text-muted" />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Right panel — Team details */}
      {selectedTeam && tab === 'teams' && (
        <div className="flex-1 min-w-0 max-w-2xl">
          <div className="sticky top-6">
            <h2 className="text-lg font-semibold text-text-primary mb-1">{selectedTeam.name}</h2>
            {selectedTeam.description && (
              <p className="text-sm text-text-muted mb-4">{selectedTeam.description}</p>
            )}

            {/* Right panel tabs */}
            <div className="flex gap-1 mb-4 rounded-lg bg-bg-secondary p-1 border border-border">
              <button
                onClick={() => setRightTab('members')}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  rightTab === 'members' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Members
              </button>
              <button
                onClick={() => setRightTab('permissions')}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  rightTab === 'permissions' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Permissions
              </button>
            </div>

            {/* Members panel */}
            {rightTab === 'members' && (
              <div className="rounded-lg border border-border bg-bg-secondary divide-y divide-border max-h-[60vh] overflow-y-auto">
                {users.filter((u) => u.role !== 'admin').length === 0 ? (
                  <p className="p-4 text-sm text-text-muted text-center">No non-admin users</p>
                ) : (
                  users.filter((u) => u.role !== 'admin').map((user) => {
                    const isMember = teamMembers.includes(user.id);
                    return (
                      <label key={user.id} className="flex items-center gap-3 px-3 py-2 hover:bg-bg-hover cursor-pointer">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                            isMember ? 'border-accent bg-accent' : 'border-border bg-bg-tertiary'
                          }`}
                          onClick={(e) => { e.preventDefault(); toggleMember(user.id); }}
                        >
                          {isMember && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-sm text-text-primary">{user.username}</span>
                        {user.displayName && <span className="text-xs text-text-muted">({user.displayName})</span>}
                        {!user.isActive && <span className="text-[10px] text-status-down">Disabled</span>}
                      </label>
                    );
                  })
                )}
              </div>
            )}

            {/* Permissions panel — Hierarchical tree */}
            {rightTab === 'permissions' && (
              <div className="rounded-lg border border-border bg-bg-secondary max-h-[70vh] overflow-y-auto">
                {tree.length === 0 && ungroupedMonitors.length === 0 ? (
                  <p className="p-4 text-sm text-text-muted text-center">No groups or monitors</p>
                ) : (
                  <div className="py-1">
                    {tree.map((node) => (
                      <PermTreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        monitorsByGroup={monitorsByGroup}
                        getGroupPerm={getGroupPerm}
                        getMonitorPerm={getMonitorPerm}
                        assignedGroupIds={assignedGroupIds}
                        coveredGroupIds={coveredGroupIds}
                        coveredByGroupId={coveredByGroupId}
                        addPermission={addPermission}
                        removePermission={removePermission}
                        togglePermissionLevel={togglePermissionLevel}
                      />
                    ))}
                    {/* Ungrouped monitors */}
                    {ungroupedMonitors.map((m) => {
                      const perm = getMonitorPerm(m.id);
                      return (
                        <PermMonitorRow
                          key={m.id}
                          monitor={m}
                          depth={0}
                          perm={perm}
                          isCovered={false}
                          addPermission={addPermission}
                          removePermission={removePermission}
                          togglePermissionLevel={togglePermissionLevel}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Permission Tree Sub-Components ──

interface PermTreeNodeProps {
  node: GroupTreeNode;
  depth: number;
  monitorsByGroup: Map<number, MonitorType[]>;
  getGroupPerm: (groupId: number) => TeamPermission | undefined;
  getMonitorPerm: (monitorId: number) => TeamPermission | undefined;
  assignedGroupIds: Set<number>;
  coveredGroupIds: Set<number>;
  coveredByGroupId: Map<number, number>;
  addPermission: (scope: PermissionScope, scopeId: number, level: PermissionLevel) => Promise<void>;
  removePermission: (permId: number) => Promise<void>;
  togglePermissionLevel: (perm: TeamPermission) => Promise<void>;
}

function PermTreeNode({
  node,
  depth,
  monitorsByGroup,
  getGroupPerm,
  getMonitorPerm,
  assignedGroupIds,
  coveredGroupIds,
  coveredByGroupId,
  addPermission,
  removePermission,
  togglePermissionLevel,
}: PermTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const perm = getGroupPerm(node.id);
  const isCovered = coveredGroupIds.has(node.id);
  const hasChildren = node.children.length > 0 || (monitorsByGroup.get(node.id)?.length ?? 0) > 0;

  return (
    <div>
      {/* Group row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 hover:bg-bg-hover transition-colors ${
          perm ? 'bg-accent/5' : isCovered ? 'bg-accent/[0.02]' : ''
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`shrink-0 p-0.5 text-text-muted hover:text-text-primary transition-colors ${!hasChildren ? 'invisible' : ''}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <FolderOpen size={13} className={`shrink-0 ${perm ? 'text-accent' : isCovered ? 'text-accent/40' : 'text-text-muted'}`} />
        <span className={`flex-1 text-sm truncate ${perm ? 'text-text-primary font-medium' : isCovered ? 'text-text-muted' : 'text-text-primary'}`}>
          {node.name}
        </span>

        {node.isGeneral && (
          <span className="text-[10px] text-accent bg-accent/10 px-1 rounded shrink-0">General</span>
        )}

        {/* Permission controls */}
        {perm ? (
          <>
            <button
              onClick={() => togglePermissionLevel(perm)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 ${
                perm.level === 'rw'
                  ? 'bg-accent/10 text-accent hover:bg-accent/20'
                  : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover'
              }`}
              title="Click to toggle RO/RW"
            >
              {perm.level === 'rw' ? <><Pencil size={10} className="inline mr-0.5" />RW</> : <><Eye size={10} className="inline mr-0.5" />RO</>}
            </button>
            <button onClick={() => removePermission(perm.id)} className="p-0.5 text-text-muted hover:text-status-down shrink-0">
              <Trash2 size={11} />
            </button>
          </>
        ) : isCovered ? (
          <span className="text-[10px] text-text-muted italic shrink-0">inherited</span>
        ) : (
          <>
            <button onClick={() => addPermission('group', node.id, 'ro')}
              className="px-1.5 py-0.5 text-[10px] rounded bg-bg-tertiary text-text-muted hover:bg-bg-hover shrink-0" title="Read Only">
              RO
            </button>
            <button onClick={() => addPermission('group', node.id, 'rw')}
              className="px-1.5 py-0.5 text-[10px] rounded bg-accent/10 text-accent hover:bg-accent/20 shrink-0" title="Read/Write">
              RW
            </button>
          </>
        )}
      </div>

      {/* Children (groups + monitors) */}
      {expanded && (
        <>
          {node.children.map((child) => (
            <PermTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              monitorsByGroup={monitorsByGroup}
              getGroupPerm={getGroupPerm}
              getMonitorPerm={getMonitorPerm}
              assignedGroupIds={assignedGroupIds}
              coveredGroupIds={coveredGroupIds}
              coveredByGroupId={coveredByGroupId}
              addPermission={addPermission}
              removePermission={removePermission}
              togglePermissionLevel={togglePermissionLevel}
            />
          ))}
          {(monitorsByGroup.get(node.id) ?? []).map((m) => {
            const mPerm = getMonitorPerm(m.id);
            const mCovered = !mPerm && (assignedGroupIds.has(node.id) || coveredGroupIds.has(node.id));
            return (
              <PermMonitorRow
                key={m.id}
                monitor={m}
                depth={depth + 1}
                perm={mPerm}
                isCovered={mCovered}
                addPermission={addPermission}
                removePermission={removePermission}
                togglePermissionLevel={togglePermissionLevel}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

interface PermMonitorRowProps {
  monitor: MonitorType;
  depth: number;
  perm: TeamPermission | undefined;
  isCovered: boolean;
  addPermission: (scope: PermissionScope, scopeId: number, level: PermissionLevel) => Promise<void>;
  removePermission: (permId: number) => Promise<void>;
  togglePermissionLevel: (perm: TeamPermission) => Promise<void>;
}

function PermMonitorRow({
  monitor,
  depth,
  perm,
  isCovered,
  addPermission,
  removePermission,
  togglePermissionLevel,
}: PermMonitorRowProps) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 hover:bg-bg-hover transition-colors ${
        perm ? 'bg-accent/5' : ''
      }`}
      style={{ paddingLeft: `${depth * 20 + 28}px` }}
    >
      <Monitor size={13} className={`shrink-0 ${perm ? 'text-accent' : isCovered ? 'text-accent/40' : 'text-text-muted'}`} />
      <span className={`flex-1 text-sm truncate ${perm ? 'text-text-primary font-medium' : isCovered ? 'text-text-muted' : 'text-text-primary'}`}>
        {monitor.name}
      </span>

      {perm ? (
        <>
          <button
            onClick={() => togglePermissionLevel(perm)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 ${
              perm.level === 'rw'
                ? 'bg-accent/10 text-accent hover:bg-accent/20'
                : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover'
            }`}
            title="Click to toggle RO/RW"
          >
            {perm.level === 'rw' ? <><Pencil size={10} className="inline mr-0.5" />RW</> : <><Eye size={10} className="inline mr-0.5" />RO</>}
          </button>
          <button onClick={() => removePermission(perm.id)} className="p-0.5 text-text-muted hover:text-status-down shrink-0">
            <Trash2 size={11} />
          </button>
        </>
      ) : isCovered ? (
        <span className="text-[10px] text-text-muted italic shrink-0">inherited</span>
      ) : (
        <>
          <button onClick={() => addPermission('monitor', monitor.id, 'ro')}
            className="px-1.5 py-0.5 text-[10px] rounded bg-bg-tertiary text-text-muted hover:bg-bg-hover shrink-0" title="Read Only">
            RO
          </button>
          <button onClick={() => addPermission('monitor', monitor.id, 'rw')}
            className="px-1.5 py-0.5 text-[10px] rounded bg-accent/10 text-accent hover:bg-accent/20 shrink-0" title="Read/Write">
            RW
          </button>
        </>
      )}
    </div>
  );
}
