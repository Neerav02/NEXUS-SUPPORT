import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Radio,
  CalendarDays,
  Clock,
  TrendingUp,
  Eye,
  Zap,
  UserPlus,
  UserMinus,
  PlusCircle,
  XCircle,
  RefreshCw,
  Wifi,
  Trash2,
  Download,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { NexusLogo } from '../components/ui/NexusLogo';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { toast } from 'react-hot-toast';
import './AdminPage.css';

// ── Types ──
interface MetricsSummary {
  activeSessions: number;
  sessionsToday: number;
  totalMinutesToday: number;
  avgDurationSeconds: number;
}

interface LiveSession {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  agent: { id: string; displayName: string; email: string };
  participants: { identity: string; role: string; joinedAt: string }[];
}

interface ActivityEvent {
  id: string;
  eventType: string;
  actorIdentity: string;
  actorRole: string;
  occurredAt: string;
  session: { id: string; title: string };
}

interface AllSession {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
  recordingStatus: 'none' | 'recording' | 'processing' | 'ready' | 'failed';
  recordingUrl: string | null;
  agent: { id: string; displayName: string; email: string };
  participants: { identity: string; role: string; joinedAt: string; leftAt: string | null; totalDurationSeconds: number | null }[];
  _count: { messages: number; events: number };
}

export const AdminPage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [allSessions, setAllSessions] = useState<AllSession[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'all'>('live');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const headers = { Authorization: `Bearer ${token}` };

  // ── Fetch all admin data ──
  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, liveRes, eventsRes, allRes] = await Promise.all([
        api.get('/admin/metrics/summary', { headers }),
        api.get('/admin/sessions/live', { headers }),
        api.get('/admin/events/recent?limit=20', { headers }),
        api.get('/admin/sessions/all?limit=20', { headers }),
      ]);

      setMetrics(metricsRes.data.data);
      setLiveSessions(liveRes.data.data);
      setEvents(eventsRes.data.data);
      setAllSessions(allRes.data.data);
    } catch (err) {
      console.error('Admin fetch error', err);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Force-end session handler ──
  const handleForceEnd = async (sessionId: string, title: string) => {
    const confirm = window.confirm(`Force-end session "${title}"? This will disconnect all participants.`);
    if (!confirm) return;

    try {
      await api.delete(`/admin/sessions/${sessionId}`, { headers });
      toast.success(`Session "${title}" force-ended`);
      fetchData();
    } catch (err) {
      toast.error('Failed to force-end session');
    }
  };

  // ── Helpers ──
  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const eventIcon = (type: string) => {
    switch (type) {
      case 'joined': return <UserPlus size={14} />;
      case 'left': return <UserMinus size={14} />;
      case 'created': return <PlusCircle size={14} />;
      case 'ended': return <XCircle size={14} />;
      case 'reconnected': return <Wifi size={14} />;
      default: return <Zap size={14} />;
    }
  };

  const eventText = (evt: ActivityEvent) => {
    const actor = evt.actorIdentity.includes('@')
      ? evt.actorIdentity.split('@')[0]
      : evt.actorIdentity.slice(0, 8);

    switch (evt.eventType) {
      case 'joined': return <><strong>{actor}</strong> joined <em>{evt.session.title}</em></>;
      case 'left': return <><strong>{actor}</strong> left <em>{evt.session.title}</em></>;
      case 'created': return <><strong>{actor}</strong> created <em>{evt.session.title}</em></>;
      case 'ended': return <><strong>{actor}</strong> ended <em>{evt.session.title}</em></>;
      case 'reconnected': return <><strong>{actor}</strong> reconnected to <em>{evt.session.title}</em></>;
      default: return <><strong>{actor}</strong> — {evt.eventType} in <em>{evt.session.title}</em></>;
    }
  };

  const sessionDuration = (session: AllSession) => {
    const agentParticipant = session.participants.find((p) => p.role === 'agent');
    if (agentParticipant?.totalDurationSeconds) return formatDuration(agentParticipant.totalDurationSeconds);
    if (session.endedAt && session.createdAt) {
      const diff = Math.floor((new Date(session.endedAt).getTime() - new Date(session.createdAt).getTime()) / 1000);
      return formatDuration(diff);
    }
    return '—';
  };

  return (
    <div className="admin-page">
      {/* ── Header ── */}
      <header className="admin-header">
        <div className="admin-header__left">
          <NexusLogo size={36} />
          <div>
            <h1 className="admin-header__title">NEXUS SUPPORT</h1>
            <p className="admin-header__subtitle">Admin Command Center</p>
          </div>
        </div>

        <div className="admin-header__right">
          <span className="admin-header__time">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => { fetchData(); toast.success('Refreshed'); }}>
            <RefreshCw size={14} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={14} />
            Dashboard
          </Button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="admin-main">
        {/* ── KPI Stat Cards ── */}
        <motion.div
          className="admin-stats-grid"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="stat-card stat-card--active">
            <div className="stat-card__header">
              <div className="stat-card__icon"><Radio size={18} /></div>
            </div>
            <span className="stat-card__value">
              {loading ? '—' : metrics?.activeSessions ?? 0}
            </span>
            <span className="stat-card__label">Live Sessions</span>
          </div>

          <div className="stat-card stat-card--sessions">
            <div className="stat-card__header">
              <div className="stat-card__icon"><CalendarDays size={18} /></div>
            </div>
            <span className="stat-card__value">
              {loading ? '—' : metrics?.sessionsToday ?? 0}
            </span>
            <span className="stat-card__label">Sessions Today</span>
          </div>

          <div className="stat-card stat-card--duration">
            <div className="stat-card__header">
              <div className="stat-card__icon"><Clock size={18} /></div>
            </div>
            <span className="stat-card__value">
              {loading ? '—' : `${metrics?.totalMinutesToday ?? 0}m`}
            </span>
            <span className="stat-card__label">Support Minutes Today</span>
          </div>

          <div className="stat-card stat-card--avg">
            <div className="stat-card__header">
              <div className="stat-card__icon"><TrendingUp size={18} /></div>
            </div>
            <span className="stat-card__value">
              {loading ? '—' : formatDuration(metrics?.avgDurationSeconds ?? 0)}
            </span>
            <span className="stat-card__label">Avg Call Duration (7d)</span>
          </div>
        </motion.div>

        {/* ── Two-Column Layout ── */}
        <motion.div
          className="admin-body-grid"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {/* ── Left: Live Sessions / All Sessions ── */}
          <div className="admin-panel">
            <div className="admin-tabs">
              <button
                className={`admin-tab ${activeTab === 'live' ? 'admin-tab--active' : ''}`}
                onClick={() => setActiveTab('live')}
              >
                <Radio size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Live Sessions
              </button>
              <button
                className={`admin-tab ${activeTab === 'all' ? 'admin-tab--active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <Eye size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                All Sessions
              </button>
            </div>

            <div className="admin-panel__body">
              {activeTab === 'live' ? (
                liveSessions.length === 0 ? (
                  <div className="admin-empty">
                    <Radio size={36} className="admin-empty__icon" />
                    <p className="admin-empty__text">No active sessions right now</p>
                  </div>
                ) : (
                  liveSessions.map((session) => (
                    <div key={session.id} className="live-session-card">
                      <div className="live-session-card__info">
                        <span className="live-session-card__title">{session.title}</span>
                        <span className="live-session-card__meta">
                          {session.agent.displayName} · {session.participants.length} participant{session.participants.length !== 1 ? 's' : ''}
                          {' · '}{timeAgo(session.createdAt)}
                        </span>
                      </div>
                      <div className="live-session-card__actions">
                        <span className="live-session-card__status">
                          <span className="status-dot status-dot--active" />
                          Live
                        </span>
                        <button
                          className="btn-force-end"
                          onClick={() => handleForceEnd(session.id, session.title)}
                        >
                          <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          End
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className="sessions-table-wrapper">
                  <table className="sessions-table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Status</th>
                        <th>Agent</th>
                        <th>Participants</th>
                        <th>Messages</th>
                        <th>Duration</th>
                        <th>Recording</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSessions.map((session) => (
                        <tr key={session.id}>
                          <td style={{ fontWeight: 600 }}>{session.title}</td>
                          <td>
                            <span className={`status-badge status-badge--${session.status}`}>
                              {session.status === 'active' && <span className="status-dot status-dot--active" />}
                              {session.status === 'waiting' && <span className="status-dot status-dot--waiting" />}
                              {session.status}
                            </span>
                          </td>
                          <td>{session.agent.displayName}</td>
                          <td>{session.participants.length}</td>
                          <td>{session._count.messages}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{sessionDuration(session)}</td>
                          <td>
                            {session.recordingStatus === 'ready' && session.recordingUrl ? (
                              <a
                                href={session.recordingUrl.startsWith('http') ? session.recordingUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}${session.recordingUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-rec-download-link"
                                title="Download Call Recording"
                              >
                                <Download size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                MP4
                              </a>
                            ) : session.recordingStatus === 'processing' ? (
                              <span className="admin-rec-badge admin-rec-badge--processing" title="FFmpeg Transcoding...">
                                ⏳ processing
                              </span>
                            ) : session.recordingStatus === 'recording' ? (
                              <span className="admin-rec-badge admin-rec-badge--active">
                                🔴 live
                              </span>
                            ) : session.recordingStatus === 'failed' ? (
                              <span className="admin-rec-badge admin-rec-badge--failed">
                                ⚠️ failed
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{timeAgo(session.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Activity Feed ── */}
          <div className="admin-panel">
            <div className="admin-panel__header">
              <h3 className="admin-panel__title">
                <Zap size={16} />
                Activity Feed
              </h3>
              <span className="admin-panel__count">{events.length}</span>
            </div>
            <div className="admin-panel__body">
              {events.length === 0 ? (
                <div className="admin-empty">
                  <Zap size={36} className="admin-empty__icon" />
                  <p className="admin-empty__text">No recent activity</p>
                </div>
              ) : (
                <div className="activity-feed">
                  {events.map((evt) => (
                    <div key={evt.id} className="activity-item">
                      <div className={`activity-icon activity-icon--${evt.eventType}`}>
                        {eventIcon(evt.eventType)}
                      </div>
                      <div className="activity-content">
                        <p className="activity-text">{eventText(evt)}</p>
                        <p className="activity-time">{timeAgo(evt.occurredAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};
