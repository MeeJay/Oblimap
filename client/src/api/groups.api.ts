import apiClient from './client';
import type {
  MonitorGroup,
  GroupTreeNode,
  ApiResponse,
  CreateGroupRequest,
  UpdateGroupRequest,
} from '@oblimap/shared';

export const groupsApi = {
  async list(): Promise<MonitorGroup[]> {
    const res = await apiClient.get<ApiResponse<MonitorGroup[]>>('/groups');
    return res.data.data!;
  },

  async tree(): Promise<GroupTreeNode[]> {
    const res = await apiClient.get<ApiResponse<GroupTreeNode[]>>('/groups/tree');
    return res.data.data!;
  },

  async getById(id: number): Promise<MonitorGroup> {
    const res = await apiClient.get<ApiResponse<MonitorGroup>>(`/groups/${id}`);
    return res.data.data!;
  },

  async create(data: CreateGroupRequest): Promise<MonitorGroup> {
    const res = await apiClient.post<ApiResponse<MonitorGroup>>('/groups', data);
    return res.data.data!;
  },

  async update(id: number, data: UpdateGroupRequest): Promise<MonitorGroup> {
    const res = await apiClient.put<ApiResponse<MonitorGroup>>(`/groups/${id}`, data);
    return res.data.data!;
  },

  async move(id: number, newParentId: number | null): Promise<MonitorGroup> {
    const res = await apiClient.post<ApiResponse<MonitorGroup>>(`/groups/${id}/move`, { newParentId });
    return res.data.data!;
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/groups/${id}`);
  },

  async getStats(): Promise<Record<number, { uptimePct: number; total: number; up: number }>> {
    const res = await apiClient.get<ApiResponse<Record<number, { uptimePct: number; total: number; up: number }>>>('/groups/stats');
    return res.data.data!;
  },

  async reorder(items: { id: number; sortOrder: number }[]): Promise<void> {
    await apiClient.post('/groups/reorder', { items });
  },

};
