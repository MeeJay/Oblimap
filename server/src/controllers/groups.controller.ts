import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { groupService } from '../services/group.service';
import { permissionService } from '../services/permission.service';
import { teamService } from '../services/team.service';
import { groupNotificationService } from '../services/groupNotification.service';
import { AppError } from '../middleware/errorHandler';
import type { CreateGroupInput, UpdateGroupInput, MoveGroupInput } from '../validators/group.schema';

export const groupsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isAdmin = req.session.role === 'admin';
      const allGroups = await groupService.getAll(req.tenantId);

      if (isAdmin) {
        res.json({ success: true, data: allGroups });
        return;
      }

      const visibleIds = await permissionService.getVisibleGroupIds(req.session.userId!, false);
      if (visibleIds === 'all') {
        res.json({ success: true, data: allGroups });
        return;
      }

      const visibleSet = new Set(visibleIds);
      const filtered = allGroups.filter((g) => visibleSet.has(g.id));
      res.json({ success: true, data: filtered });
    } catch (err) {
      next(err);
    }
  },

  async tree(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isAdmin = req.session.role === 'admin';
      const tree = await groupService.getTree(req.tenantId);

      if (isAdmin) {
        res.json({ success: true, data: tree });
        return;
      }

      const visibleIds = await permissionService.getVisibleGroupIds(req.session.userId!, false);
      if (visibleIds === 'all') {
        res.json({ success: true, data: tree });
        return;
      }

      // Filter tree to only include visible groups
      const visibleSet = new Set(visibleIds);
      function filterTree(nodes: typeof tree): typeof tree {
        return nodes
          .filter((n) => visibleSet.has(n.id))
          .map((n) => ({ ...n, children: filterTree(n.children) }));
      }
      res.json({ success: true, data: filterTree(tree) });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const group = await groupService.getById(id);
      if (!group) throw new AppError(404, 'Group not found');

      const isAdmin = req.session.role === 'admin';
      if (!isAdmin) {
        const canRead = await permissionService.canReadGroup(req.session.userId!, id, false);
        if (!canRead) throw new AppError(403, 'Access denied');
      }

      res.json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateGroupInput;

      // Validate parent exists if specified
      if (data.parentId) {
        const parent = await groupService.getById(data.parentId);
        if (!parent) throw new AppError(400, 'Parent group not found');
      }

      const group = await groupService.create(data, req.tenantId);

      // Auto-assign RW to creator's teams that have canCreate
      if (req.session.role !== 'admin') {
        const userTeams = await teamService.getUserTeams(req.session.userId!);
        for (const team of userTeams) {
          if (team.canCreate) {
            await teamService.addPermission(team.id, 'group', group.id, 'rw');
          }
        }
      }

      // Broadcast via Socket.io
      const io = req.app.get('io');
      if (io) {
        io.to('role:admin').emit('group:created', { group });
      }

      res.status(201).json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const data = req.body as UpdateGroupInput;
      const group = await groupService.update(id, data);

      if (!group) throw new AppError(404, 'Group not found');

      if (data.groupNotifications !== undefined) {
        groupNotificationService.removeGroup(id);
      }

      const io = req.app.get('io');
      if (io) {
        io.to('role:admin').emit('group:updated', { group });
      }

      res.json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },

  async move(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const { newParentId } = req.body as MoveGroupInput;

      // Also check write permission on target parent if non-admin
      const isAdmin = req.session.role === 'admin';
      if (!isAdmin && newParentId !== null) {
        const canWriteTarget = await permissionService.canWriteGroup(req.session.userId!, newParentId, false);
        if (!canWriteTarget) throw new AppError(403, 'No write permission on target group');
      }

      const group = await groupService.move(id, newParentId);
      if (!group) throw new AppError(404, 'Group not found');

      const io = req.app.get('io');
      if (io) {
        io.to('role:admin').emit('group:moved', { group });
      }

      res.json({ success: true, data: group });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('circular')) {
        next(new AppError(400, err.message));
      } else {
        next(err);
      }
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);

      groupNotificationService.removeGroup(id);

      const deleted = await groupService.delete(id);
      if (!deleted) throw new AppError(404, 'Group not found');

      const io = req.app.get('io');
      if (io) {
        io.to('role:admin').emit('group:deleted', { groupId: id });
      }

      res.json({ success: true, message: 'Group deleted' });
    } catch (err) {
      next(err);
    }
  },

  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const allGroups = await groupService.getAll(tenantId);
      const result: Record<number, { uptimePct: number; total: number; up: number; siteCount: number; onlineCount: number; offlineCount: number }> = {};

      for (const group of allGroups) {
        const descendantIds = await groupService.getDescendantIds(group.id);

        const row = await db('sites')
          .where('tenant_id', tenantId)
          .whereIn('group_id', descendantIds)
          .leftJoin(
            db('site_items')
              .select('site_id')
              .count('* as item_count')
              .where('tenant_id', tenantId)
              .groupBy('site_id')
              .as('ic'),
            'sites.id', 'ic.site_id',
          )
          .leftJoin(
            db('site_items')
              .select('site_id')
              .count('* as online_count')
              .where({ tenant_id: tenantId, status: 'online' })
              .groupBy('site_id')
              .as('oc'),
            'sites.id', 'oc.site_id',
          )
          .leftJoin(
            db('site_items')
              .select('site_id')
              .count('* as offline_count')
              .where({ tenant_id: tenantId, status: 'offline' })
              .groupBy('site_id')
              .as('ofc'),
            'sites.id', 'ofc.site_id',
          )
          .select(
            db.raw('COUNT(DISTINCT sites.id)::int as site_count'),
            db.raw('COALESCE(SUM(ic.item_count), 0)::int as total'),
            db.raw('COALESCE(SUM(oc.online_count), 0)::int as online_count'),
            db.raw('COALESCE(SUM(ofc.offline_count), 0)::int as offline_count'),
          )
          .first();

        const total = Number(row?.total ?? 0);
        const online = Number(row?.online_count ?? 0);
        const offline = Number(row?.offline_count ?? 0);
        const siteCount = Number(row?.site_count ?? 0);
        const uptimePct = total > 0 ? Math.round((online / total) * 100) : 100;

        result[group.id] = { total, up: online, uptimePct, siteCount, onlineCount: online, offlineCount: offline };
      }

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // IPAM mode: no heartbeats
  async clearHeartbeats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: { deleted: 0, monitorCount: 0 } });
    } catch (err) {
      next(err);
    }
  },

  async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = req.body.items as { id: number; sortOrder: number }[];
      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError(400, 'items array is required');
      }
      await groupService.reorder(items);

      const io = req.app.get('io');
      if (io) {
        io.to('role:admin').emit('group:reordered', { items });
      }

      res.json({ success: true, message: 'Groups reordered' });
    } catch (err) {
      next(err);
    }
  },

  // IPAM mode: no monitors
  async getMonitors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = parseInt(req.params.id, 10);
      const group = await groupService.getById(groupId);
      if (!group) throw new AppError(404, 'Group not found');
      res.json({ success: true, data: [] });
    } catch (err) {
      next(err);
    }
  },

  // IPAM mode: no heartbeats
  async heartbeats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = parseInt(req.params.id, 10);
      const group = await groupService.getById(groupId);
      if (!group) throw new AppError(404, 'Group not found');
      res.json({ success: true, data: [] });
    } catch (err) {
      next(err);
    }
  },

  // IPAM mode: real site/device stats for this group (replaces dummy heartbeat stats)
  async groupDetailStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = parseInt(req.params.id, 10);
      const tenantId = req.tenantId;
      const group = await groupService.getById(groupId);
      if (!group) throw new AppError(404, 'Group not found');

      const descendantIds = await groupService.getDescendantIds(groupId);

      const row = await db('sites')
        .where('tenant_id', tenantId)
        .whereIn('group_id', descendantIds)
        .leftJoin(
          db('site_items')
            .select('site_id')
            .count('* as item_count')
            .where('tenant_id', tenantId)
            .groupBy('site_id')
            .as('ic'),
          'sites.id', 'ic.site_id',
        )
        .leftJoin(
          db('site_items')
            .select('site_id')
            .count('* as online_count')
            .where({ tenant_id: tenantId, status: 'online' })
            .groupBy('site_id')
            .as('oc'),
          'sites.id', 'oc.site_id',
        )
        .select(
          db.raw('COUNT(DISTINCT sites.id)::int as site_count'),
          db.raw('COALESCE(SUM(ic.item_count), 0)::int as total'),
          db.raw('COALESCE(SUM(oc.online_count), 0)::int as up'),
        )
        .first();

      const total = Number(row?.total ?? 0);
      const up = Number(row?.up ?? 0);
      const siteCount = Number(row?.site_count ?? 0);
      const uptimePct = total > 0 ? Math.round((up / total) * 100) : 100;

      res.json({ success: true, data: { uptimePct, total, up, siteCount } });
    } catch (err) {
      next(err);
    }
  },

  /** GET /groups/:id/probes — list all probes in this group and its sub-groups */
  async getGroupProbes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = parseInt(req.params.id, 10);
      const tenantId = req.tenantId;

      const group = await groupService.getById(groupId);
      if (!group) throw new AppError(404, 'Group not found');

      const isAdmin = req.session.role === 'admin';
      if (!isAdmin) {
        const canRead = await permissionService.canReadGroup(req.session.userId!, groupId, false);
        if (!canRead) throw new AppError(403, 'Access denied');
      }

      const descendantIds = await groupService.getDescendantIds(groupId);
      const siteIds: number[] = await db('sites')
        .whereIn('group_id', descendantIds)
        .where('tenant_id', tenantId)
        .pluck('id');

      if (siteIds.length === 0) {
        res.json({ probes: [] });
        return;
      }

      const probes = await db('probes')
        .whereIn('probes.site_id', siteIds)
        .where('probes.tenant_id', tenantId)
        .leftJoin('sites', 'probes.site_id', 'sites.id')
        .select('probes.*', 'sites.name as site_name');

      const mapped = probes.map((p: any) => ({
        id: p.id,
        uuid: p.uuid,
        hostname: p.hostname,
        ip: p.ip,
        mac: p.mac,
        name: p.name,
        status: p.status,
        probeVersion: p.probe_version,
        siteId: p.site_id,
        siteName: p.site_name,
        lastSeenAt: p.last_seen_at,
        createdAt: p.created_at,
      }));

      res.json({ probes: mapped });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /groups/:id/agent-config — update agent group config (thresholds + group settings) */
  async updateAgentGroupConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = parseInt(req.params.id, 10);
      if (req.session.role !== 'admin') throw new AppError(403, 'Admin only');

      const group = await groupService.getById(groupId);
      if (!group) throw new AppError(404, 'Group not found');
      if (group.kind !== 'agent') throw new AppError(400, 'Not an agent group');

      const { agentGroupConfig, agentThresholds } = req.body as {
        agentGroupConfig?: { pushIntervalSeconds?: number | null; heartbeatMonitoring?: boolean | null; maxMissedPushes?: number | null };
        agentThresholds?: unknown;
      };

      let updated = group;
      if (agentGroupConfig !== undefined) {
        updated = (await groupService.updateAgentGroupConfig(groupId, agentGroupConfig)) ?? updated;
      }
      if (agentThresholds !== undefined) {
        updated = (await groupService.updateAgentThresholds(groupId, agentThresholds as any)) ?? updated;
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
};
