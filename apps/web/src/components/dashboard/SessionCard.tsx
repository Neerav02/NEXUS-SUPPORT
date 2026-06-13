import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Users, MessageSquare } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatRelativeTime, formatDuration } from '../../lib/utils';
import './SessionCard.css';

interface SessionCardProps {
  session: {
    id: string;
    title: string;
    status: 'waiting' | 'active' | 'ended';
    inviteToken: string;
    startedAt: string | null;
    createdAt: string;
    participants: Array<{
      identity: string;
      role: string;
      totalDurationSeconds: number | null;
    }>;
    _count: {
      messages: number;
    };
  };
  onClick: () => void;
}

export const SessionCard: React.FC<SessionCardProps> = ({ session, onClick }) => {
  const customerParticipant = session.participants.find(p => p.role === 'customer');
  const duration = session.participants.find(p => p.role === 'agent')?.totalDurationSeconds;

  return (
    <motion.div
      className="session-card"
      whileHover={{ y: -2 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="session-card__header">
        <h3 className="session-card__title">{session.title}</h3>
        <Badge variant={session.status}>
          {session.status}
        </Badge>
      </div>

      <div className="session-card__meta">
        <span className="session-card__meta-item">
          <Clock size={14} />
          {formatRelativeTime(session.createdAt)}
        </span>

        <span className="session-card__meta-item">
          <Users size={14} />
          {session.participants.length} participant{session.participants.length !== 1 ? 's' : ''}
        </span>

        {session._count.messages > 0 && (
          <span className="session-card__meta-item">
            <MessageSquare size={14} />
            {session._count.messages}
          </span>
        )}
      </div>

      {customerParticipant && (
        <p className="session-card__customer">
          Customer: <strong>{customerParticipant.identity}</strong>
        </p>
      )}

      {duration && (
        <p className="session-card__duration">
          Duration: {formatDuration(duration)}
        </p>
      )}
    </motion.div>
  );
};
