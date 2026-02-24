# Obliview
Self-hosted uptime & infrastructure monitoring with multi-user access control, hierarchical groups, settings inheritance, and 10+ notification channels (Telegram, Teams, Discord, Slack…). Deploy in one command.

Obliview is a self-hosted monitoring application built for teams. It goes beyond simple uptime checking by combining multi-user access control, hierarchical group organization, and a flexible notification system into a single deployable stack.

<h3>Monitor anything</h3>
Obliview supports 11 monitor types out of the box: HTTP/HTTPS, Ping, TCP port, DNS, SSL certificate, SMTP, Docker container, Game server, Push (passive), custom Script, and JSON API with value extraction. Each monitor tracks response time, uptime history, and status in real time.

<h3>Built for teams</h3>
Users are assigned read or read-write access per group, so each team member only sees and manages what they're supposed to. Admins retain full control over the entire system, while non-admin users get a focused, clean dashboard scoped to their permissions.

<h3>Hierarchical groups</h3>
Organize monitors into nested groups with unlimited depth. Settings and notification channels cascade down the hierarchy. Configure once at the top, override where needed. Groups can be flagged as "general" (visible to all users) or restricted to specific team members.

<h3>Flexible notifications</h3>
Supports 10 notification channels: Telegram, Discord, Slack, Microsoft Teams, SMTP, Webhook, Gotify, Ntfy, Pushover, and Free Mobile. Channels are bound at global, group, or monitor level and follow an inheritance chain with merge, replace, or exclude modes. Group notification mode lets you receive a single alert when the first monitor in a group goes down, and one recovery when all are back up.

<h3>Persistent custom directory</h3>
A /custom volume persists scripts and SSH keys across container updates and recreates, making Script monitors that connect to remote hosts fully maintainable without re-configuration.

<h3>Easy deployment</h3>
One command to get started:<br>
<code>curl -fsSL https://raw.githubusercontent.com/MeeJay/obliview/main/install.sh | sh</code>

Or pull the images directly from Docker Hub and bring your own PostgreSQL instance.

Stack: Node.js · TypeScript · Express · React · Vite · Tailwind CSS · PostgreSQL · Socket.io
