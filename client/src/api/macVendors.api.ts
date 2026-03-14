import apiClient from './client';
import type { MacVendor } from '@oblimap/shared';
import type { AxiosResponse } from 'axios';

export interface MacVendorListResponse {
  vendors: MacVendor[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface MacVendorStatsResponse {
  total: number;
  overrides: number;
  lastUpdated: string | null;
}

export const macVendorsApi = {
  list: (params?: {
    q?: string;
    page?: number;
    limit?: number;
    overrideOnly?: boolean;
  }): Promise<MacVendorListResponse> =>
    apiClient
      .get('/mac-vendors', { params })
      .then((r: AxiosResponse) => r.data as MacVendorListResponse),

  stats: (): Promise<MacVendorStatsResponse> =>
    apiClient
      .get('/mac-vendors/stats')
      .then((r: AxiosResponse) => r.data as MacVendorStatsResponse),

  updateCustomName: (prefix: string, customName: string | null): Promise<{ vendor: MacVendor }> =>
    apiClient
      .patch(`/mac-vendors/${encodeURIComponent(prefix)}`, { customName })
      .then((r: AxiosResponse) => r.data as { vendor: MacVendor }),

  clearOverride: (prefix: string): Promise<void> =>
    apiClient
      .delete(`/mac-vendors/${encodeURIComponent(prefix)}/override`)
      .then(() => undefined),
};
