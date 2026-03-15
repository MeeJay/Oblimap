import type { UserRole } from './ipamTypes';
import type { SettingsKey } from './settingsDefaults';

// ============================================
// App / Theme
// ============================================
export type AppTheme = 'modern' | 'neon';

export interface UserPreferences {
  toastEnabled: boolean;
  toastPosition: 'top-center' | 'bottom-right';
  multiTenantNotificationsEnabled?: boolean;
  preferredTheme?: AppTheme;
}

/** Shape of a live alert as returned by the server */
export interface LiveAlertData {
  id: number;
  tenantId: number;
  tenantName?: string;
  severity: 'down' | 'up' | 'warning' | 'info';
  title: string;
  message: string;
  navigateTo: string | null;
  stableKey: string | null;
  read: boolean;
  createdAt: string;
}

// ============================================
// Users
// ============================================
export interface User {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  preferences?: UserPreferences | null;
  email?: string | null;
  preferredLanguage: string;
  enrollmentVersion: number;
  totpEnabled?: boolean;
  emailOtpEnabled?: boolean;
  /** SSO foreign user fields — null for local users */
  foreignSource?: string | null;
  foreignId?: number | null;
  foreignSourceUrl?: string | null;
  /** True when user has no local password (SSO-only account) */
  hasPassword?: boolean;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

// ============================================
// Groups
// ============================================
export interface MonitorGroup {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parentId: number | null;
  tenantId: number;
  kind?: 'monitor' | 'agent' | null; // keep for backwards compat
  sortOrder?: number | null;
  isGeneral?: boolean;
  groupNotifications?: boolean;
  agentThresholds?: unknown;
  agentGroupConfig?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface GroupTreeNode extends MonitorGroup {
  children: GroupTreeNode[];
  depth: number;
  monitors?: any[]; // backwards compat
}

export interface GroupStats {
  groupId: number;
  siteCount: number;
  onlineCount: number;
  offlineCount: number;
}

// ============================================
// Teams
// ============================================
export interface UserTeam {
  id: number;
  name: string;
  description: string | null;
  canCreate: boolean;
  tenantId: number;
  tenantName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamPermission {
  id: number;
  teamId: number;
  scope: 'group' | 'monitor';
  scopeId: number;
  level: 'ro' | 'rw';
}

// ============================================
// Tenants
// ============================================
export interface Tenant {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantMembership {
  tenantId: number;
  role: 'admin' | 'member';
}

export interface TenantWithRole extends Tenant {
  role: 'admin' | 'member';
}

export interface UserTenantAssignment {
  tenantId: number;
  tenantName: string;
  tenantSlug: string;
  isMember: boolean;
  role: 'admin' | 'member';
}

// ============================================
// Settings
// ============================================
export type SettingsScope = 'global' | 'group' | 'site' | 'monitor';

export interface SettingValue {
  value: string | number | boolean | null;
  source: SettingsScope | 'default';
  sourceId: number | null;
  sourceName: string | null;
}

export type ResolvedSettings = Record<SettingsKey, SettingValue>;

// ============================================
// Notifications
// ============================================
export type NotificationOverrideMode = 'merge' | 'replace' | 'exclude';

// Aliases for backwards compat
export type OverrideMode = NotificationOverrideMode;
export type NotificationOverride = NotificationOverrideMode;

export interface NotificationChannel {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  tenantId?: number;
  isEnabled?: boolean;
  isShared?: boolean;
  createdBy?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationBinding {
  id: number;
  channelId: number;
  channelName?: string;
  channelType?: string;
  scope: string;
  scopeId: number | null;
  overrideMode: NotificationOverrideMode;
  onDown?: boolean;
  onUp?: boolean;
  onWarning?: boolean;
  tenantId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationPluginMeta {
  type: string;
  name: string;
  description: string;
  configFields: NotificationConfigField[];
}

// NotificationConfigField (used in notification plugin metadata)
export interface NotificationConfigField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  description?: string;
}

// ============================================
// App Config (used by appConfig.service)
// ============================================
export interface AppConfig {
  obliguardUrl?: string | null;
  obliviewUrl?: string | null;
  oblianceUrl?: string | null;
  registrationEnabled?: boolean;
  ssoSecret?: string | null;
  allow_2fa?: boolean;
  force_2fa?: boolean;
  otp_smtp_server_id?: number | null;
  enable_foreign_sso?: boolean;
  enable_obliview_sso?: boolean;
  enable_obliance_sso?: boolean;
  [key: string]: unknown;
}

// ============================================
// SmtpServer (used by smtpServer.service)
// ============================================
export interface SmtpServer {
  id: number;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  fromAddress: string | null;
  isDefault?: boolean;
  tenantId?: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Permission
// ============================================
export type PermissionLevel = 'ro' | 'rw';

// ============================================
// User permissions
// ============================================
export interface UserPermissions {
  role?: UserRole;
  canCreate: boolean;
  canWriteSite?: boolean;
  canWriteGroup?: boolean;
  canAdmin?: boolean;
  teams?: number[] | Array<{
    teamId: number;
    teamName: string;
    permission: 'read' | 'write';
    scopeId: number | null;
    scope: string;
  }>;
  permissions?: Record<string, PermissionLevel>;
}

// ============================================
// IPAM — Device Types
// ============================================
export type DeviceType =
  | 'router'
  | 'switch'
  | 'server'
  | 'printer'
  | 'iot'
  | 'camera'
  | 'counter'
  | 'workstation'
  | 'phone'
  | 'gsm'
  | 'laptop'
  | 'vm'
  | 'ap'
  | 'firewall'
  | 'nas'
  | 'unknown';

export type ItemStatus = 'online' | 'offline' | 'reserved' | 'unknown';

// ============================================
// IPAM — Sites
// ============================================
export interface Site {
  id: number;
  name: string;
  description: string | null;
  groupId: number | null;
  tenantId: number;
  createdAt: string;
  updatedAt: string;
  /** Counts populated by JOIN queries */
  itemCount?: number;
  onlineCount?: number;
  offlineCount?: number;
  probeCount?: number;
}

// ============================================
// IPAM — Site Items (network devices)
// ============================================
export interface SiteItem {
  id: number;
  siteId: number;
  tenantId: number;
  ip: string;
  mac: string | null;
  /** Hostname from DNS/ARP — original, not editable by user */
  hostname: string | null;
  /** User-set display name (replaces hostname in UI when set) */
  customName: string | null;
  deviceType: DeviceType;
  vendor: string | null;
  notes: string | null;
  status: ItemStatus;
  isManual: boolean;
  discoveredByProbeId: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  /** True if a reservation exists for this item's IP */
  hasReservationConflict?: boolean;
  /** True if this item corresponds to a known probe (matched by IP or MAC) */
  isProbe?: boolean;
  /** The probe ID if this item is a probe, for linking to probe detail */
  probeId?: number | null;
  /** Open TCP ports discovered by the last port scan */
  openPorts?: number[] | null;
}

export interface ItemIpHistory {
  id: number;
  mac: string;
  siteId: number;
  tenantId: number;
  ip: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

// ============================================
// IPAM — IP Reservations
// ============================================
export interface IpReservation {
  id: number;
  siteId: number;
  tenantId: number;
  ip: string;
  name: string;
  description: string | null;
  deviceType: DeviceType | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  /** True if a live device is currently using this IP */
  isOccupied?: boolean;
  occupiedByMac?: string | null;
}

// ============================================
// IPAM — MAC Vendors
// ============================================
export interface MacVendor {
  prefix: string;       // e.g. "AA:BB:CC"
  vendorName: string;   // from IEEE OUI database
  customName: string | null; // admin-defined override (null = use vendorName)
  /** Effective display name: customName if set, else vendorName */
  effectiveName: string;
  updatedAt: string;
}

// ============================================
// IPAM — Vendor Type Rules
// ============================================
export interface VendorTypeRule {
  id: number;
  groupId: number | null;
  tenantId: number;
  vendorPattern: string;
  deviceType: DeviceType;
  label: string | null;
  priority: number;
  createdAt: string;
}

// ============================================
// IPAM — Probes
// ============================================
export type ProbeStatus = 'pending' | 'approved' | 'refused' | 'suspended';

export interface ProbeApiKey {
  id: number;
  name: string;
  key: string;
  tenantId: number;
  createdBy: number | null;
  createdAt: string;
  lastUsedAt: string | null;
  probeCount?: number;
}

export interface ProbeScanConfig {
  excludedSubnets: string[];
  extraSubnets: string[];
  portScanEnabled?: boolean;
  portScanPorts?: number[];
}

export interface Probe {
  id: number;
  uuid: string;
  hostname: string;
  ip: string | null;
  mac: string | null;
  osInfo: {
    platform: string;
    distro?: string;
    release?: string;
    arch?: string;
  } | null;
  probeVersion: string | null;
  apiKeyId: number | null;
  status: ProbeStatus;
  tenantId: number;
  siteId: number | null;
  name: string | null;
  scanIntervalSeconds: number;
  scanConfig: ProbeScanConfig;
  lastSeenAt: string | null;
  pendingCommand: string | null;
  uninstallCommandedAt: string | null;
  updatingSince: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Backwards-compat API types (used by client api/ layer)
// ============================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateGroupRequest {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: number | null;
  isGeneral?: boolean;
  groupNotifications?: boolean;
  kind?: 'monitor' | 'agent' | null;
  [key: string]: unknown;
}

export interface UpdateGroupRequest {
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: number | null;
  isGeneral?: boolean;
  groupNotifications?: boolean;
  kind?: 'monitor' | 'agent' | null;
  [key: string]: unknown;
}

export interface CreateNotificationChannelRequest {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface UpdateNotificationChannelRequest {
  name?: string;
  config?: Record<string, unknown>;
}

export interface CreateTeamRequest {
  name: string;
  description?: string | null;
  canCreate?: boolean;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string | null;
  canCreate?: boolean;
}

export interface SetTeamMembersRequest {
  members?: Array<{ userId: number; permission: 'read' | 'write' }>;
  userIds?: number[];
  [key: string]: unknown;
}

export interface SetTeamPermissionsRequest {
  permissions: Array<{ scope: string; scopeId: number | null; level: 'ro' | 'rw' }>;
}

export interface CreateUserRequest {
  username: string;
  displayName?: string | null;
  password?: string;
  role?: UserRole;
  email?: string | null;
}

export interface UpdateUserRequest {
  username?: string;
  displayName?: string | null;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  email?: string | null;
}

// Legacy Monitor type (used by pages that haven't been fully migrated)
export interface Monitor {
  id: number;
  name: string;
  type: string;
  status: string;
  groupId: number | null;
  isActive: boolean;
  [key: string]: unknown;
}

// Legacy Heartbeat type
export interface Heartbeat {
  id: number;
  monitorId: number;
  status: string;
  responseTime: number | null;
  createdAt: string;
  value?: string | null;
  [key: string]: unknown;
}

// Legacy Agent types (kept for backwards compat during migration)
export interface AgentApiKey extends ProbeApiKey {
  deviceCount?: number;
  [key: string]: unknown;
}
export interface AgentDevice extends Probe {
  groupId?: number | null;
  heartbeatMonitoring?: boolean;
  overrideGroupSettings?: boolean;
  agentVersion?: string | null;
  [key: string]: unknown;
}
export type AgentThresholds = Record<string, any>;
export type AgentMetricThreshold = Record<string, any>;
export type AgentTempThreshold = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentDisplayConfig = any;
export type AgentGroupConfig = Record<string, unknown>;
export type AgentGlobalConfig = Record<string, unknown>;
export type NotificationTypeConfig = Record<string, boolean | null>;
export type ObliguardConfig  = { url?: string | null; ssoSecret?: string; obliviewUrl?: string; apiKey?: string; apiKeySet?: boolean; [key: string]: unknown };
export type ObliviewConfig   = { url?: string | null; apiKey?: string; apiKeySet?: boolean; [key: string]: unknown };
export type OblianceConfig   = { url?: string | null; apiKey?: string; apiKeySet?: boolean; [key: string]: unknown };

export const DEFAULT_NOTIFICATION_TYPES: NotificationTypeConfig = {};
export const DEFAULT_AGENT_THRESHOLDS: AgentThresholds = {};
export const DEFAULT_AGENT_GLOBAL_CONFIG: AgentGlobalConfig = {};
export const MONITOR_TYPE_LABELS: Record<string, string> = {};

// PermissionScope for AdminUsersPage
export type PermissionScope = 'global' | 'group' | 'site' | 'monitor';
