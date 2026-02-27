import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { agentService } from '../services/agent.service';

// ── Push endpoint (called by agent) ──────────────────────────────────────────

export async function agentPush(req: Request, res: Response): Promise<void> {
  try {
    // agentApiKeyId is set by agentAuth middleware
    const agentApiKeyId = (req as unknown as { agentApiKeyId: number }).agentApiKeyId;
    const deviceUuid = req.headers['x-device-uuid'] as string | undefined;

    if (!deviceUuid) {
      res.status(400).json({ error: 'X-Device-UUID header required' });
      return;
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';

    const result = await agentService.handlePush(
      agentApiKeyId,
      deviceUuid,
      clientIp,
      req.body,
    );

    const statusCode = result.status === 'ok' ? 200 : result.status === 'pending' ? 202 : 401;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Public: version + download ──────────────────────────────────────────────

export function agentVersion(_req: Request, res: Response): void {
  try {
    const info = agentService.getAgentVersion();
    res.json(info);
  } catch {
    res.status(503).json({ error: 'Agent version info unavailable' });
  }
}

export function agentDownload(req: Request, res: Response): void {
  const { filename } = req.params;

  if (!['agent.js', 'package.json'].includes(filename)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const filePath =
    filename === 'agent.js'
      ? path.resolve(__dirname, '../../../../agent/src/index.js')
      : path.resolve(__dirname, '../../../../agent/package.json');

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Agent file not built yet' });
    return;
  }

  res.sendFile(filePath);
}

export function agentInstallerLinux(req: Request, res: Response): void {
  const apiKey = req.query.key as string | undefined;

  const scriptPath = path.resolve(__dirname, '../../../../agent/installer/install.sh');
  if (!fs.existsSync(scriptPath)) {
    res.status(404).json({ error: 'Installer not available' });
    return;
  }

  let script = fs.readFileSync(scriptPath, 'utf-8');

  // Inject server URL and API key
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  script = script.replace('__SERVER_URL__', serverUrl);
  if (apiKey) {
    script = script.replace('__API_KEY__', apiKey);
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="install.sh"');
  res.send(script);
}

export function agentInstallerWindows(req: Request, res: Response): void {
  const apiKey = req.query.key as string | undefined;

  const scriptPath = path.resolve(__dirname, '../../../../agent/installer/install.ps1');
  if (!fs.existsSync(scriptPath)) {
    res.status(404).json({ error: 'Installer not available' });
    return;
  }

  let script = fs.readFileSync(scriptPath, 'utf-8');

  const serverUrl = `${req.protocol}://${req.get('host')}`;
  script = script.replace('__SERVER_URL__', serverUrl);
  if (apiKey) {
    script = script.replace('__API_KEY__', apiKey);
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="install.ps1"');
  res.send(script);
}

export function agentInstallerWindowsMsi(_req: Request, res: Response): void {
  const msiPath = path.resolve(__dirname, '../../../../agent/dist/obliview-agent.msi');
  if (!fs.existsSync(msiPath)) {
    res.status(404).json({ error: 'MSI installer not available (not yet built)' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-msi');
  res.setHeader('Content-Disposition', 'attachment; filename="obliview-agent.msi"');
  res.sendFile(msiPath);
}

// ── Admin: API Keys ──────────────────────────────────────────────────────────

export async function listKeys(_req: Request, res: Response): Promise<void> {
  const keys = await agentService.listKeys();
  res.json({ success: true, data: keys });
}

export async function createKey(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'Name is required' });
    return;
  }
  const userId = req.session?.userId ?? 0;
  const key = await agentService.createKey(name.trim(), userId);
  res.status(201).json({ success: true, data: key });
}

export async function deleteKey(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const ok = await agentService.deleteKey(id);
  if (!ok) {
    res.status(404).json({ success: false, error: 'API key not found' });
    return;
  }
  res.json({ success: true });
}

// ── Admin: Devices ──────────────────────────────────────────────────────────

export async function listDevices(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const validStatuses = ['pending', 'approved', 'refused'];
  const devices = await agentService.listDevices(
    validStatuses.includes(status ?? '') ? (status as 'pending' | 'approved' | 'refused') : undefined,
  );
  res.json({ success: true, data: devices });
}

export async function updateDevice(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { status, groupId, checkIntervalSeconds } = req.body as {
    status?: 'approved' | 'refused' | 'pending';
    groupId?: number | null;
    checkIntervalSeconds?: number;
  };

  // Special handling for approval: create monitors
  if (status === 'approved') {
    const userId = req.session?.userId ?? 0;
    const device = await agentService.approveDevice(id, userId, groupId ?? null);
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }
    res.json({ success: true, data: device });
    return;
  }

  const device = await agentService.updateDevice(id, {
    status,
    groupId,
    checkIntervalSeconds,
  });

  if (!device) {
    res.status(404).json({ success: false, error: 'Device not found' });
    return;
  }

  res.json({ success: true, data: device });
}

export async function deleteDevice(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const ok = await agentService.deleteDevice(id);
  if (!ok) {
    res.status(404).json({ success: false, error: 'Device not found' });
    return;
  }
  res.json({ success: true });
}
