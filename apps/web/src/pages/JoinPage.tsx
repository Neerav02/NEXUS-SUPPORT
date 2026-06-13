import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, AlertCircle } from 'lucide-react';
import { NexusLogo } from '../components/ui/NexusLogo';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import './JoinPage.css';

export const JoinPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !token) return;

    setError('');
    setLoading(true);

    try {
      const res = await api.post('/sessions/join', {
        inviteToken: token,
        displayName: displayName.trim(),
      });

      const { token: customerToken, session } = res.data.data;

      // Store customer JWT
      localStorage.setItem('nexus_customer_token', customerToken);
      localStorage.setItem('nexus_customer_session', JSON.stringify(session));

      // Navigate to the session call page
      navigate(`/sessions/${session.id}`);
    } catch (err: any) {
      const message = err.response?.data?.error || 'Failed to join session';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-page">
      {/* Background Ambient */}
      <div className="join-page__ambient">
        <div className="join-page__orb join-page__orb--1" />
        <div className="join-page__orb join-page__orb--2" />
      </div>

      <motion.div
        className="join-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="join-card__header">
          <NexusLogo size={48} />
          <h1 className="join-card__title">NEXUS SUPPORT</h1>
          <p className="join-card__subtitle">You've been invited to a support session</p>
        </div>

        {error && (
          <motion.div
            className="join-card__error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleJoin} className="join-card__form">
          <div className="join-card__field">
            <label htmlFor="join-name" className="join-card__label">Your Name</label>
            <input
              id="join-name"
              type="text"
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoFocus
              maxLength={50}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            disabled={!displayName.trim()}
          >
            <UserPlus size={18} />
            Join Now
          </Button>
        </form>

        <p className="join-card__footer">
          By joining, you accept that this session may be recorded for quality purposes
        </p>
      </motion.div>
    </div>
  );
};
