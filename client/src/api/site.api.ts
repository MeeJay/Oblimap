import apiClient from './client';
import type { Site, SiteItem, IpReservation, DeviceType } from '@oblimap/shared';
import type { AxiosResponse } from 'axios';

export const siteApi = {
  // ── Sites ─────────────────────────────────────────────────────────────────

  list: (params?: { groupId?: number; ungrouped?: boolean }): Promise<{ sites: Site[] }> =>
    apiClient.get('/sites', { params }).then((r: AxiosResponse) => r.data as { sites: Site[] }),

  get: (id: number): Promise<{ site: Site }> =>
    apiClient.get(`/sites/${id}`).then((r: AxiosResponse) => r.data as { site: Site }),

  create: (data: { name: string; description?: string | null; groupId?: number | null }): Promise<{ site: Site }> =>
    apiClient.post('/sites', data).then((r: AxiosResponse) => r.data as { site: Site }),

  update: (
    id: number,
    data: Partial<{ name: string; description: string | null; groupId: number | null }>,
  ): Promise<{ site: Site }> =>
    apiClient.patch(`/sites/${id}`, data).then((r: AxiosResponse) => r.data as { site: Site }),

  remove: (id: number): Promise<void> =>
    apiClient.delete(`/sites/${id}`).then(() => undefined),

  // ── Items ─────────────────────────────────────────────────────────────────

  listItems: (siteId: number): Promise<{ items: SiteItem[] }> =>
    apiClient.get(`/sites/${siteId}/items`).then((r: AxiosResponse) => r.data as { items: SiteItem[] }),

  createItem: (
    siteId: number,
    data: { ip: string; mac?: string | null; customName?: string | null; deviceType?: DeviceType; notes?: string | null },
  ): Promise<{ item: SiteItem }> =>
    apiClient.post(`/sites/${siteId}/items`, data).then((r: AxiosResponse) => r.data as { item: SiteItem }),

  updateItem: (
    siteId: number,
    itemId: number,
    data: Partial<{ customName: string | null; deviceType: DeviceType; notes: string | null; status: SiteItem['status'] }>,
  ): Promise<{ item: SiteItem }> =>
    apiClient.patch(`/sites/${siteId}/items/${itemId}`, data).then((r: AxiosResponse) => r.data as { item: SiteItem }),

  removeItem: (siteId: number, itemId: number): Promise<void> =>
    apiClient.delete(`/sites/${siteId}/items/${itemId}`).then(() => undefined),

  removeSubnet: (siteId: number, prefix: string): Promise<{ deleted: number }> =>
    apiClient.delete(`/sites/${siteId}/items-by-subnet`, { params: { prefix } })
      .then((r: AxiosResponse) => r.data as { deleted: number }),

  // ── Reservations ──────────────────────────────────────────────────────────

  listReservations: (siteId: number): Promise<{ reservations: IpReservation[] }> =>
    apiClient.get(`/sites/${siteId}/reservations`).then((r: AxiosResponse) => r.data as { reservations: IpReservation[] }),

  createReservation: (
    siteId: number,
    data: { ip: string; name: string; description?: string | null; deviceType?: DeviceType | null },
  ): Promise<{ reservation: IpReservation }> =>
    apiClient.post(`/sites/${siteId}/reservations`, data).then((r: AxiosResponse) => r.data as { reservation: IpReservation }),

  updateReservation: (
    siteId: number,
    resId: number,
    data: Partial<{ name: string; description: string | null; deviceType: DeviceType | null }>,
  ): Promise<{ reservation: IpReservation }> =>
    apiClient.patch(`/sites/${siteId}/reservations/${resId}`, data).then((r: AxiosResponse) => r.data as { reservation: IpReservation }),

  removeReservation: (siteId: number, resId: number): Promise<void> =>
    apiClient.delete(`/sites/${siteId}/reservations/${resId}`).then(() => undefined),
};
