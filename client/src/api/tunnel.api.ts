import apiClient from './client';
import type { Tunnel } from '@oblimap/shared';
import type { AxiosResponse } from 'axios';

export const tunnelApi = {
  open: (
    siteId: number,
    targetIp: string,
    targetPort: number,
    probeId?: number | null,
  ): Promise<{ tunnel: Tunnel }> =>
    apiClient
      .post('/tunnel', { siteId, targetIp, targetPort, probeId })
      .then((r: AxiosResponse) => r.data as { tunnel: Tunnel }),

  list: (): Promise<{ tunnels: Tunnel[] }> =>
    apiClient.get('/tunnel').then((r: AxiosResponse) => r.data as { tunnels: Tunnel[] }),

  get: (id: string): Promise<{ tunnel: Tunnel }> =>
    apiClient.get(`/tunnel/${id}`).then((r: AxiosResponse) => r.data as { tunnel: Tunnel }),

  close: (id: string): Promise<void> =>
    apiClient.delete(`/tunnel/${id}`).then(() => undefined),
};
