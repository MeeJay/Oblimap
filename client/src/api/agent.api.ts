import apiClient from './client';
import type { AgentApiKey, AgentDevice, ApiResponse } from '@obliview/shared';

export const agentApi = {
  // ── API Keys ─────────────────────────────────────────────────────────────

  async listKeys(): Promise<AgentApiKey[]> {
    const res = await apiClient.get<ApiResponse<AgentApiKey[]>>('/agent/keys');
    return res.data.data!;
  },

  async createKey(name: string): Promise<AgentApiKey> {
    const res = await apiClient.post<ApiResponse<AgentApiKey>>('/agent/keys', { name });
    return res.data.data!;
  },

  async deleteKey(id: number): Promise<void> {
    await apiClient.delete(`/agent/keys/${id}`);
  },

  // ── Devices ───────────────────────────────────────────────────────────────

  async listDevices(status?: AgentDevice['status']): Promise<AgentDevice[]> {
    const params = status ? { status } : {};
    const res = await apiClient.get<ApiResponse<AgentDevice[]>>('/agent/devices', { params });
    return res.data.data!;
  },

  async updateDevice(
    id: number,
    data: {
      status?: AgentDevice['status'];
      groupId?: number | null;
      checkIntervalSeconds?: number;
    },
  ): Promise<AgentDevice> {
    const res = await apiClient.patch<ApiResponse<AgentDevice>>(`/agent/devices/${id}`, data);
    return res.data.data!;
  },

  async deleteDevice(id: number): Promise<void> {
    await apiClient.delete(`/agent/devices/${id}`);
  },

  // ── Agent version ─────────────────────────────────────────────────────────

  async getVersion(): Promise<{ version: string; downloadUrl: string }> {
    const res = await apiClient.get<{ version: string; downloadUrl: string }>('/agent/version');
    return res.data;
  },

  // ── Installer URLs ────────────────────────────────────────────────────────

  getInstallerLinuxUrl(apiKey: string): string {
    return `${window.location.origin}/api/agent/installer/linux?key=${encodeURIComponent(apiKey)}`;
  },

  getInstallerWindowsUrl(apiKey: string): string {
    return `${window.location.origin}/api/agent/installer/windows?key=${encodeURIComponent(apiKey)}`;
  },

  getMsiUrl(): string {
    return `${window.location.origin}/api/agent/installer/windows.msi`;
  },
};
