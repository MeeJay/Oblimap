import apiClient from './client';
import type { AppConfig, AgentGlobalConfig, ObliguardConfig, ObliviewConfig, OblianceConfig, ApiResponse } from '@oblimap/shared';

export const appConfigApi = {
  async getConfig(): Promise<AppConfig> {
    const res = await apiClient.get<ApiResponse<AppConfig>>('/admin/config');
    return res.data.data!;
  },

  async setConfig(key: keyof AppConfig, value: boolean | number | null): Promise<void> {
    await apiClient.put(`/admin/config/${key}`, { value: String(value ?? '') });
  },

  async getAgentGlobal(): Promise<AgentGlobalConfig> {
    const res = await apiClient.get<ApiResponse<AgentGlobalConfig>>('/admin/config/agent-global');
    return res.data.data!;
  },

  async patchAgentGlobal(patch: Partial<AgentGlobalConfig>): Promise<AgentGlobalConfig> {
    const res = await apiClient.patch<ApiResponse<AgentGlobalConfig>>('/admin/config/agent-global', patch);
    return res.data.data!;
  },

  async getObliguardConfig(): Promise<ObliguardConfig> {
    const res = await apiClient.get<ApiResponse<ObliguardConfig>>('/admin/config/obliguard');
    return res.data.data!;
  },

  async setObliguardConfig(cfg: ObliguardConfig): Promise<void> {
    await apiClient.put('/admin/config/obliguard', cfg);
  },

  async proxyObliguardLink(uuid: string): Promise<string | null> {
    const res = await apiClient.get<ApiResponse<{ obliguardUrl: string | null }>>(`/obliguard/proxy-link?uuid=${encodeURIComponent(uuid)}`);
    return res.data.data?.obliguardUrl ?? null;
  },

  // ── Obliview ────────────────────────────────────────────────────────────────

  async getObliviewConfig(): Promise<ObliviewConfig> {
    const res = await apiClient.get<ApiResponse<ObliviewConfig>>('/admin/config/obliview');
    return res.data.data!;
  },

  async setObliviewConfig(cfg: ObliviewConfig): Promise<void> {
    await apiClient.put('/admin/config/obliview', cfg);
  },

  async proxyObliviewLink(uuid: string): Promise<string | null> {
    const res = await apiClient.get<ApiResponse<{ obliviewUrl: string | null }>>(`/obliview/proxy-link?uuid=${encodeURIComponent(uuid)}`);
    return res.data.data?.obliviewUrl ?? null;
  },

  // ── Obliance ────────────────────────────────────────────────────────────────

  async getOblianceConfig(): Promise<OblianceConfig> {
    const res = await apiClient.get<ApiResponse<OblianceConfig>>('/admin/config/obliance');
    return res.data.data!;
  },

  async setOblianceConfig(cfg: OblianceConfig): Promise<void> {
    await apiClient.put('/admin/config/obliance', cfg);
  },

  async proxyOblianceLink(uuid: string): Promise<string | null> {
    const res = await apiClient.get<ApiResponse<{ oblianceUrl: string | null }>>(`/obliance/proxy-link?uuid=${encodeURIComponent(uuid)}`);
    return res.data.data?.oblianceUrl ?? null;
  },
};
