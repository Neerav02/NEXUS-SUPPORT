import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SessionCard } from './SessionCard';
import { SessionCardSkeleton } from '../ui/Skeleton';
import { useSessions } from '../../hooks/useSession';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';
import { NexusLogo } from '../ui/NexusLogo';
import './SessionList.css';

const STATUS_FILTERS = [
  { label: 'All', value: undefined },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Active', value: 'active' },
  { label: 'Ended', value: 'ended' },
] as const;

const MOCK_SESSIONS = [
  {
    id: 'mock-1',
    title: 'Customer Onboarding & Setup Call (Preview)',
    status: 'active' as const,
    inviteToken: 'mock-invite-1',
    inviteUrl: 'http://localhost:5173/join/mock-invite-1',
    startedAt: new Date().toISOString(),
    endedAt: null,
    recordingStatus: 'none',
    createdAt: new Date().toISOString(),
    agent: { id: 'agent-1', displayName: 'Support Agent', email: 'agent@nexus.support' },
    participants: [
      { identity: 'Agent', role: 'agent', joinedAt: new Date().toISOString(), leftAt: null, totalDurationSeconds: null },
      { identity: 'Customer #4810', role: 'customer', joinedAt: new Date().toISOString(), leftAt: null, totalDurationSeconds: null }
    ],
    _count: { messages: 5 }
  },
  {
    id: 'mock-2',
    title: 'Billing Query - Plan Upgrade Assistance (Preview)',
    status: 'waiting' as const,
    inviteToken: 'mock-invite-2',
    inviteUrl: 'http://localhost:5173/join/mock-invite-2',
    startedAt: null,
    endedAt: null,
    recordingStatus: 'none',
    createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
    agent: { id: 'agent-1', displayName: 'Support Agent', email: 'agent@nexus.support' },
    participants: [],
    _count: { messages: 0 }
  },
  {
    id: 'mock-3',
    title: 'Technical Troubleshooting - API Connection Error (Preview)',
    status: 'ended' as const,
    inviteToken: 'mock-invite-3',
    inviteUrl: 'http://localhost:5173/join/mock-invite-3',
    startedAt: new Date(Date.now() - 120 * 60000).toISOString(),
    endedAt: new Date(Date.now() - 100 * 60000).toISOString(),
    recordingStatus: 'none',
    createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
    agent: { id: 'agent-1', displayName: 'Support Agent', email: 'agent@nexus.support' },
    participants: [
      { identity: 'Agent', role: 'agent', joinedAt: new Date().toISOString(), leftAt: null, totalDurationSeconds: null },
      { identity: 'Developer Guest', role: 'customer', joinedAt: new Date().toISOString(), leftAt: null, totalDurationSeconds: null }
    ],
    _count: { messages: 27 }
  }
];

export const SessionList: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { isAuthenticated } = useAuth();
  
  // Only query server sessions if authenticated
  const { data, isLoading, error } = useSessions(statusFilter, isAuthenticated);
  const navigate = useNavigate();

  const handleSessionClick = (sessionId: string) => {
    if (!isAuthenticated) {
      toast.error('Please sign in or register to access support sessions.');
      navigate('/login');
      return;
    }
    navigate(`/sessions/${sessionId}`);
  };

  // Determine which sessions list to render
  let sessionsToRender = data?.data;
  if (!isAuthenticated) {
    sessionsToRender = MOCK_SESSIONS.filter(
      (s) => !statusFilter || s.status === statusFilter
    ) as any;
  }

  return (
    <div className="session-list">
      {/* Status Filter Tabs */}
      <div className="session-list__filters">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            className={`session-list__filter-btn ${statusFilter === filter.value ? 'session-list__filter-btn--active' : ''}`}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="session-list__grid">
          {[...Array(4)].map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="session-list__empty">
          <p style={{ color: 'var(--danger)' }}>Failed to load sessions. Is the backend running?</p>
        </div>
      )}

      {/* Sessions Grid */}
      {sessionsToRender && sessionsToRender.length > 0 && (
        <div className="session-list__grid">
          {sessionsToRender.map((session: any) => (
            <div key={session.id} style={{ position: 'relative' }}>
              {!isAuthenticated && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  zIndex: 2,
                  background: 'rgba(255, 171, 0, 0.15)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255, 171, 0, 0.3)',
                  color: '#ffab00',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}>
                  PREVIEW (LOGIN REQUIRED)
                </div>
              )}
              <SessionCard
                session={session}
                onClick={() => handleSessionClick(session.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {sessionsToRender && sessionsToRender.length === 0 && (
        <div className="session-list__empty">
          <NexusLogo size={48} />
          <h3>No sessions yet</h3>
          <p>Create your first session to get started</p>
        </div>
      )}

      {/* Pagination Info */}
      {isAuthenticated && data?.pagination && data.pagination.totalPages > 1 && (
        <div className="session-list__pagination">
          <span>
            Page {data.pagination.page} of {data.pagination.totalPages}
            {' · '}
            {data.pagination.total} total sessions
          </span>
        </div>
      )}
    </div>
  );
};
