<p align="center">
  <img src="client/public/logo.svg" alt="Oblimap" height="80">
</p>

<h3 align="center">Self-hosted IP Address Management</h3>

<p align="center">
  Network discovery, device inventory, subnet visualization, distributed probes.
  <br>
  Part of the <a href="https://obli.tools"><strong>obli.tools</strong></a> ecosystem.
</p>

---

Oblimap is an enterprise IPAM platform with multi-tenant support, real-time network discovery, hierarchical site management, and intelligent device tracking. Deploy lightweight Go probes across your network segments to automatically discover, classify, and monitor devices.

## Features at a Glance

- **Distributed network probes** — Go binary for Windows/Linux/macOS, auto-discovers subnets, ARP table, reverse DNS, port scanning
- **Device inventory** — MAC-based tracking, vendor lookup (30,000+ OUI prefixes), 16 device types, IP history
- **IP reservation system** — reserve IPs with names and device types, occupation detection
- **Subnet heatmap** — D3.js visualization of IP utilization per site
- **Intelligent detection** — IP takeover alerts, IP instability detection (3+ MACs on same IP)
- **Vendor classification** — auto-classify devices by MAC vendor with priority-based rules
- **10 notification channels** — Telegram, Discord, Slack, Teams, SMTP, Webhook, Gotify, Ntfy, Pushover, Free Mobile
- **Multi-tenant workspaces** — isolated tenants with per-workspace roles
- **Teams & RBAC** — read-only / read-write per group or site
- **2FA** — TOTP authenticator apps + Email OTP
- **Import / Export** — full config backup as JSON with conflict resolution
- **18 UI languages**
- **Real-time** — Socket.io live updates, device status changes, discovery events
- **SSO** — federated login via Obligate

---

## Network Probe

A lightweight Go binary deployed on network segments. Scans local subnets and pushes device data to the server — no inbound ports required.

**Scanning capabilities**
- Subnet enumeration from active network interfaces (up to /20 CIDR blocks)
- Concurrent TCP scanning (up to 4094 hosts per subnet)
- ARP table reading for MAC discovery (no root required)
- Reverse DNS lookup with concurrent resolution
- Optional full port scanning (admin-configurable port list)
- Probe self-identification in discovered device list
- Scan duration and scanned subnets reporting

**Deployment**
- Windows: MSI installer (WiX v4)
- Linux / macOS: native binary, systemd / launchctl service
- Auto-update: checks server for newer versions on startup and via push responses
- Auto-uninstall command via server

**Configuration per probe**
- Scan interval (seconds)
- Excluded subnets (CIDR blocks to skip)
- Extra subnets (additional scan targets beyond auto-detected)
- Port scan toggle and target ports
- Exponential backoff on connection failures (5min, 10min, 30min, 60min)

**Probe management**
- API key generation for probe authentication
- Approval workflow: pending, approved, refused, suspended
- Probe version and OS/architecture tracking
- Commands: update, rescan, uninstall
- Auto-delete 10 minutes after uninstall command

---

## Device & IP Management

### Site Management

Organize your network into logical sites (offices, data centers, branches).

- Create sites with descriptions and group assignments
- Bulk device import from probe discoveries
- Manual device entry for reserved or non-discoverable IPs
- Real-time device sync via Socket.io
- CSV and Excel export of device inventories

### Device Inventory

Track every device on your network by MAC address.

- **MAC-based primary key** — follows devices across IP changes
- **IP fallback matching** for devices without MACs
- **Status states**: Online, Offline, Reserved, Unknown
- **16 device types**: Router, Switch, Server, Workstation, Printer, IoT, Camera, Counter, Phone, GSM/Mobile, Laptop, VM, Access Point, Firewall, NAS, Unknown
- **Custom device names** and notes
- **Vendor lookup** via IEEE OUI database (30,000+ prefixes)
- **Custom vendor overrides** per OUI prefix
- **First/last seen timestamps**
- **Open ports** discovered during scanning
- **Discovery source** tracking (which probe found it)
- **IP history** — all MAC-to-IP pairs indexed with timestamps

### IP Reservation System

- Reserve IPs to prevent automatic assignment
- Named reservations with descriptions and device types
- Occupation detection — see which MAC currently uses a reserved IP

### Intelligent Detection

- **IP takeover alerts** — new MAC claims an existing IP, old device preserved offline
- **IP instability detection** — 3+ MACs on same IP within 30min triggers alert
- **Offline marking** — devices not in latest scan automatically marked offline

---

## Subnet Heatmap

D3.js-powered visualization of subnet IP utilization integrated into site detail pages.

- Visual density representation of device distribution
- Interactive subnet navigation
- Color-coded occupancy levels

---

## Vendor Classification

Automatically classify discovered devices by their MAC vendor.

- **IEEE OUI database** — 30,000+ prefixes with standard vendor names
- **Custom override names** — rename vendors per OUI prefix
- **Vendor type rules** — auto-assign device types based on vendor name patterns
- **Priority-based matching** — first matching rule wins, drag-to-reorder
- **Group-scoped rules** — rules can be specific to site groups

---

## Notification Channels

Bind channels at **global**, **group**, or **site** level with **merge**, **replace**, or **exclude** inheritance modes.

| Channel | Notes |
|---------|-------|
| **Telegram** | Bot token + chat ID |
| **Discord** | Webhook URL |
| **Slack** | Incoming webhook |
| **Microsoft Teams** | Webhook URL |
| **Email (SMTP)** | Custom SMTP server |
| **Webhook** | Generic HTTP — GET / POST / PUT / PATCH, custom headers |
| **Gotify** | Self-hosted push (server URL + token) |
| **Ntfy** | Self-hosted or ntfy.sh push |
| **Pushover** | Mobile push via Pushover app |
| **Free Mobile** | SMS via French mobile operator API |

**Notification types**: device down, device up, IP conflict, new device discovered.

Test messages can be sent directly from the UI to validate channel configuration.

---

## Multi-Tenant Workspaces

Create isolated workspaces within a single Oblimap instance.

- Each workspace has its own sites, devices, groups, teams, notification channels, and settings
- Users can belong to multiple workspaces with independent **admin** or **member** roles
- Platform admins have cross-workspace visibility
- Workspace switching from the UI without re-login

---

## Teams & RBAC

- Create **teams** per workspace
- Assign users to teams
- Grant teams **read-only** (RO) or **read-write** (RW) access per group or site
- Access cascades through the group hierarchy
- `canCreate` flag per team: allows non-admins to create sites and groups
- **Permission sets** — reusable permission templates across teams
- Platform admins always have full access

---

## Hierarchical Groups

Organize sites into nested groups with unlimited depth using a **closure table**.

- Settings cascade: configure once at a parent group, override where needed
- Notification channels cascade with merge / replace / exclude modes
- **General groups** visible to all users regardless of team permissions
- Drag-and-drop reordering
- Group-scoped vendor classification rules

---

## Settings Inheritance

| Level | Scope |
|-------|-------|
| Global | Applies to everything in the workspace |
| Group | Applies to the group and all subgroups |
| Site | Site-specific override |

Deleting a setting at any scope reverts it to the inherited value from the parent.

---

## Two-Factor Authentication

- **TOTP** — any authenticator app (Google Authenticator, Authy, 1Password, etc.)
- **Email OTP** — one-time code sent via SMTP
- Optional system-wide enforcement (all users must enroll 2FA)

---

## Import / Export

Full configuration backup and restore as JSON.

**Exportable sections:** site groups, sites, settings, notification channels, teams.

**Conflict resolution strategies:**
- **Update** — overwrite the existing record
- **Generate new** — create a duplicate with a fresh UUID
- **Skip** — leave the existing record untouched

---

## Live Alerts

Real-time notifications delivered via Socket.io.

- Device status changes (online/offline)
- New device discovered
- IP conflict / instability detected
- Device IP changed
- Click to navigate to the affected site or device
- Per-workspace filtering
- Auto-trim: keeps latest 200 alerts per tenant

---

## Deployment

### Docker Compose (built-in PostgreSQL)

```bash
docker compose up -d
```

### Docker Compose (external PostgreSQL)

```bash
docker compose -f docker-compose.external-db.yml up -d
```

Set `DATABASE_URL` in your `.env` to point at your existing PostgreSQL instance.

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://oblimap:changeme@localhost:5432/oblimap` |
| `SESSION_SECRET` | Session signing secret | — |
| `PORT` | Server port | `3002` |
| `NODE_ENV` | `production` or `development` | `production` |
| `CLIENT_ORIGIN` | CORS origin for the client | `http://localhost` |
| `APP_NAME` | Prefix for notification messages | `Oblimap` |
| `DEFAULT_ADMIN_USERNAME` | Admin account created on first run | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Admin password on first run | `admin123` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js 24 LTS, TypeScript, Express |
| **Database** | PostgreSQL 16, Knex (migrations + query builder) |
| **Real-time** | Socket.io |
| **Client** | React 18, Vite, Tailwind CSS, Zustand |
| **Probe** | Go (cross-platform binary) |
| **Visualization** | D3.js (subnet heatmap) |
| **Monorepo** | npm workspaces (`shared/`, `server/`, `client/`) |

---

> **An experiment with Claude Code**
>
> This project was built as an experiment to see how far Claude Code could be pushed as a development tool. Claude was used as a coding assistant throughout the entire development process.

<p align="center">
  <a href="https://obli.tools">obli.tools</a>
</p>
