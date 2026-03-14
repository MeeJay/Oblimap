import apiClient from './client';
import type { Probe, ProbeApiKey, ProbeScanConfig } from '@oblimap/shared';
import type { AxiosResponse } from 'axios';

export const probeApi = {
  // ── API Keys ──────────────────────────────────────────────────────────────

  listKeys: (): Promise<{ keys: ProbeApiKey[] }> =>
    apiClient.get('/probe/keys').then((r: AxiosResponse) => r.data as { keys: ProbeApiKey[] }),

  createKey: (name: string): Promise<{ key: ProbeApiKey }> =>
    apiClient.post('/probe/keys', { name }).then((r: AxiosResponse) => r.data as { key: ProbeApiKey }),

  deleteKey: (id: number): Promise<void> =>
    apiClient.delete(`/probe/keys/${id}`).then(() => undefined),

  // ── Probes ────────────────────────────────────────────────────────────────

  list: (): Promise<{ probes: Probe[] }> =>
    apiClient.get('/probe/devices').then((r: AxiosResponse) => r.data as { probes: Probe[] }),

  get: (id: number): Promise<{ probe: Probe }> =>
    apiClient.get(`/probe/devices/${id}`).then((r: AxiosResponse) => r.data as { probe: Probe }),

  update: (
    id: number,
    updates: Partial<{
      name: string;
      siteId: number | null;
      scanIntervalSeconds: number;
      scanConfig: ProbeScanConfig;
    }>,
  ): Promise<{ probe: Probe }> =>
    apiClient.patch(`/probe/devices/${id}`, updates).then((r: AxiosResponse) => r.data as { probe: Probe }),

  approve: (id: number): Promise<{ probe: Probe }> =>
    apiClient.post(`/probe/devices/${id}/approve`).then((r: AxiosResponse) => r.data as { probe: Probe }),

  refuse: (id: number): Promise<void> =>
    apiClient.post(`/probe/devices/${id}/refuse`).then(() => undefined),

  sendCommand: (id: number, command: string): Promise<void> =>
    apiClient.post(`/probe/devices/${id}/command`, { command }).then(() => undefined),

  remove: (id: number): Promise<void> =>
    apiClient.delete(`/probe/devices/${id}`).then(() => undefined),

  // ── Bulk ──────────────────────────────────────────────────────────────────

  bulk: (action: string, ids: number[]): Promise<void> =>
    apiClient.post('/probe/devices/bulk', { action, ids }).then(() => undefined),
};
