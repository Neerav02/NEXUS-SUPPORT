import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Session {
  id: string;
  title: string;
  status: 'waiting' | 'active' | 'ended';
  inviteToken: string;
  inviteUrl: string;
  startedAt: string | null;
  endedAt: string | null;
  recordingStatus: string;
  createdAt: string;
  agent: {
    id: string;
    displayName: string;
    email: string;
  };
  participants: Array<{
    identity: string;
    role: string;
    joinedAt: string;
    leftAt: string | null;
    totalDurationSeconds: number | null;
  }>;
  _count: {
    messages: number;
  };
}

interface SessionsResponse {
  success: boolean;
  data: Session[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Fetch the agent's sessions with optional status filter.
 */
export function useSessions(status?: string, enabled = true) {
  return useQuery({
    queryKey: ['sessions', status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await api.get<SessionsResponse>(`/sessions?${params}`);
      return res.data;
    },
    enabled,
    refetchInterval: enabled ? 10000 : false,
  });
}

/**
 * Fetch a single session by ID.
 */
export function useSession(id: string) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: async () => {
      const res = await api.get(`/sessions/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new session.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string) => {
      const res = await api.post('/sessions', { title });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * End a session.
 */
export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await api.patch(`/sessions/${sessionId}/end`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
