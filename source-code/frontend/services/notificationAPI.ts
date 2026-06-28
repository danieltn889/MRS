// Notification API client — talks to the backend /notifications endpoints.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  category: string;
  title: string;
  content?: string | null;
  data?: Record<string, any> | null;
  priority?: string;
  status: string;
  read_at?: string | null;
  created_at: string;
}

const authHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
};

const handle = async (res: Response) => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  return res.json();
};

export const getNotifications = async (
  params: { page?: number; limit?: number; category?: string; unreadOnly?: boolean } = {}
): Promise<{ notifications: AppNotification[]; total: number; page: number; limit: number }> => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.category) qs.set('category', params.category);
  if (params.unreadOnly) qs.set('read', 'false');

  const res = await fetch(`${API_BASE_URL}/notifications?${qs.toString()}`, { headers: authHeaders() });
  const json = await handle(res);
  return json.data;
};

export const getUnreadCount = async (): Promise<number> => {
  const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, { headers: authHeaders() });
  const json = await handle(res);
  return json.data?.count ?? 0;
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await handle(await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: 'PUT',
    headers: authHeaders(),
  }));
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await handle(await fetch(`${API_BASE_URL}/notifications/mark-all-read`, {
    method: 'PUT',
    headers: authHeaders(),
  }));
};

export const deleteNotification = async (id: string): Promise<void> => {
  await handle(await fetch(`${API_BASE_URL}/notifications/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }));
};
