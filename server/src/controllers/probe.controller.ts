import path from 'path';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { probeService } from '../services/probe.service';
import { settingsService } from '../services/settings.service';
import { AppError } from '../middleware/errorHandler';

// ── Public: version + download + installer + notifying-update ────────────────

export function probeVersion(_req: Request, res: Response): void {
  try {
    const info = probeService.getProbeVersion();
    res.json(info);
  } catch {
    res.status(503).json({ error: 'Probe version info unavailable' });
  }
}

const ALLOWED_PROBE_BINARIES: Record<string, string> = {
  'oblimap-probe.msi':          'oblimap-probe.msi',
  'oblimap-probe.exe':          'oblimap-probe.exe',
  'oblimap-probe-linux-amd64':  'oblimap-probe-linux-amd64',
  'oblimap-probe-linux-arm64':  'oblimap-probe-linux-arm64',
  'oblimap-probe-darwin-amd64': 'oblimap-probe-darwin-amd64',
  'oblimap-probe-darwin-arm64': 'oblimap-probe-darwin-arm64',
  'oblimap-probe-freebsd-amd64': 'oblimap-probe-freebsd-amd64',
};

export function probeDownload(req: Request, res: Response): void {
  const { filename } = req.params;
  const binaryName = ALLOWED_PROBE_BINARIES[filename];
  if (!binaryName) { res.status(404).json({ error: 'Not found' }); return; }
  const filePath = path.resolve(__dirname, '../../../../probe/dist', binaryName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Probe binary not available' });
    return;
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
}

export function probeInstallerLinux(req: Request, res: Response): void {
  const apiKey = req.query.key as string | undefined;
  const scriptPath = path.resolve(__dirname, '../../../../probe/installer/install.sh');
  if (!fs.existsSync(scriptPath)) { res.status(404).json({ error: 'Installer not available' }); return; }
  let script = fs.readFileSync(scriptPath, 'utf-8').replace(/\r\n/g, '\n');
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  script = script.replace('__SERVER_URL__', serverUrl);
  if (apiKey) script = script.replace('__API_KEY__', apiKey);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="install.sh"');
  res.send(script);
}

export function probeInstallerMacos(req: Request, res: Response): void {
  const apiKey = req.query.key as string | undefined;
  const scriptPath = path.resolve(__dirname, '../../../../probe/installer/install-macos.sh');
  if (!fs.existsSync(scriptPath)) { res.status(404).json({ error: 'macOS installer not available' }); return; }
  let script = fs.readFileSync(scriptPath, 'utf-8').replace(/\r\n/g, '\n');
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  script = script.replace('__SERVER_URL__', serverUrl);
  if (apiKey) script = script.replace('__API_KEY__', apiKey);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="install-macos.sh"');
  res.send(script);
}

export function probeInstallerFreebsd(req: Request, res: Response): void {
  const apiKey = req.query.key as string | undefined;
  const scriptPath = path.resolve(__dirname, '../../../../probe/installer/install-freebsd.sh');
  if (!fs.existsSync(scriptPath)) { res.status(404).json({ error: 'FreeBSD installer not available' }); return; }
  let script = fs.readFileSync(scriptPath, 'utf-8').replace(/\r\n/g, '\n');
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  script = script.replace('__SERVER_URL__', serverUrl);
  if (apiKey) script = script.replace('__API_KEY__', apiKey);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="install-freebsd.sh"');
  res.send(script);
}

export function probeInstallerWindowsMsi(_req: Request, res: Response): void {
  const msiPath = path.resolve(__dirname, '../../../../probe/dist/oblimap-probe.msi');
  if (!fs.existsSync(msiPath)) {
    res.status(404).json({ error: 'MSI installer not available (not yet built)' });
    return;
  }
  res.setHeader('Content-Type', 'application/x-msi');
  res.setHeader('Content-Disposition', 'attachment; filename="oblimap-probe.msi"');
  res.sendFile(msiPath);
}

export async function probeNotifyingUpdate(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const probeUuid = req.headers['x-probe-uuid'] as string | undefined;
    if (!apiKey || !probeUuid) {
      res.status(400).json({ error: 'X-API-Key and X-Probe-UUID headers required' });
      return;
    }
    const keyId = await probeService.getApiKeyIdByKey(apiKey);
    const probe = await probeService.getProbeByUuid(probeUuid);
    if (!keyId || !probe || probe.api_key_id !== keyId) {
      res.status(404).json({ error: 'Probe not found' });
      return;
    }
    await probeService.setProbeUpdating(probeUuid);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const probeController = {
  // ── Probe Push (API-key auth, no session required) ────────────────────────

  async push(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = req.headers['x-api-key'] as string | undefined;
      const probeUuid = req.headers['x-probe-uuid'] as string | undefined;

      if (!apiKey || !probeUuid) {
        res
          .status(400)
          .json({ error: 'Missing X-API-Key or X-Probe-UUID header' });
        return;
      }

      const result = await probeService.handlePush(apiKey, probeUuid, req.body);
      const { httpStatus, ...body } = result;
      res.status(httpStatus).json(body);
    } catch (err) {
      next(err);
    }
  },

  // ── API Keys ──────────────────────────────────────────────────────────────

  async listKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const keys = await probeService.getApiKeys(req.tenantId);
      res.json({ keys });
    } catch (err) {
      next(err);
    }
  },

  async createKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.body as { name: string };
      if (!name?.trim()) {
        throw new AppError(400, 'Name is required');
      }
      const key = await probeService.createApiKey(
        req.tenantId,
        name.trim(),
        req.session.userId!,
      );
      res.status(201).json({ key });
    } catch (err) {
      next(err);
    }
  },

  async deleteKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await probeService.deleteApiKey(req.tenantId, parseInt(req.params.id, 10));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // ── Probe CRUD ────────────────────────────────────────────────────────────

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probes = await probeService.getProbes(req.tenantId);
      res.json({ probes });
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probe = await probeService.getProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
      );
      if (!probe) throw new AppError(404, 'Probe not found');
      res.json({ probe });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as {
        name?: string;
        siteId?: number | null;
        scanIntervalSeconds?: number;
        scanConfig?: { excludedSubnets: string[]; extraSubnets: string[] };
        scanConfigOverride?: boolean;
        isPrimary?: boolean;
      };
      const probe = await probeService.updateProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
        body,
      );
      if (!probe) throw new AppError(404, 'Probe not found');
      res.json({ probe });
    } catch (err) {
      next(err);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probe = await probeService.approveProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
        req.session.userId!,
      );
      if (!probe) throw new AppError(404, 'Probe not found');
      res.json({ probe });
    } catch (err) {
      next(err);
    }
  },

  async refuse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await probeService.refuseProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async sendCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { command } = req.body as { command: string };
      if (!command) throw new AppError(400, 'Command is required');
      const allowed = ['uninstall', 'update', 'rescan'];
      if (!allowed.includes(command)) {
        throw new AppError(400, `Unknown command: ${command}`);
      }
      await probeService.sendCommand(
        req.tenantId,
        parseInt(req.params.id, 10),
        command,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await probeService.deleteProbe(req.tenantId, parseInt(req.params.id, 10));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // ── Effective Config ─────────────────────────────────────────────────────

  async getEffectiveConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probe = await probeService.getProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
      );
      if (!probe) throw new AppError(404, 'Probe not found');

      let groupId: number | null = null;
      if (probe.siteId) {
        const { db: database } = await import('../db');
        const site = await database('sites').where({ id: probe.siteId }).first('group_id');
        groupId = (site?.group_id as number | null) ?? null;
      }

      const resolved = await settingsService.resolveForProbe(
        req.tenantId,
        probe.id,
        probe.siteId,
        groupId,
      );
      res.json({ success: true, data: resolved });
    } catch (err) {
      next(err);
    }
  },

  // ── Bulk ──────────────────────────────────────────────────────────────────

  async bulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { action, ids } = req.body as { action: string; ids: number[] };
      if (!action || !Array.isArray(ids) || ids.length === 0) {
        throw new AppError(400, 'action and ids[] are required');
      }
      switch (action) {
        case 'approve':
          await probeService.bulkApprove(req.tenantId, ids, req.session.userId!);
          break;
        case 'delete':
          await probeService.bulkDelete(req.tenantId, ids);
          break;
        case 'uninstall':
          await probeService.bulkCommand(req.tenantId, ids, 'uninstall');
          break;
        default:
          throw new AppError(400, `Unknown bulk action: ${action}`);
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
