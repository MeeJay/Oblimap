import apiClient from './client';
import type { VendorTypeRule, DeviceType } from '@oblimap/shared';
import type { AxiosResponse } from 'axios';

export interface VendorRuleCreate {
  vendorPattern: string;
  deviceType: DeviceType;
  label?: string | null;
  priority?: number;
  groupId?: number | null;
}

export const vendorRulesApi = {
  list: (groupId?: number): Promise<{ rules: VendorTypeRule[] }> =>
    apiClient
      .get('/vendor-rules', { params: groupId !== undefined ? { groupId } : undefined })
      .then((r: AxiosResponse) => r.data as { rules: VendorTypeRule[] }),

  create: (data: VendorRuleCreate): Promise<{ rule: VendorTypeRule }> =>
    apiClient.post('/vendor-rules', data).then((r: AxiosResponse) => r.data as { rule: VendorTypeRule }),

  update: (
    id: number,
    data: Partial<Pick<VendorTypeRule, 'vendorPattern' | 'deviceType' | 'label' | 'priority'>>,
  ): Promise<{ rule: VendorTypeRule }> =>
    apiClient.patch(`/vendor-rules/${id}`, data).then((r: AxiosResponse) => r.data as { rule: VendorTypeRule }),

  remove: (id: number): Promise<void> =>
    apiClient.delete(`/vendor-rules/${id}`).then(() => undefined),
};
