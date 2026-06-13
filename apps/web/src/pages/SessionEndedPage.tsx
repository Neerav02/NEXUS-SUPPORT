import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Home, LogOut } from 'lucide-react';
import { NexusLogo } from '../components/ui/NexusLogo';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import './SessionEndedPage.css';

export const SessionEndedPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [isAgent, setIsAgent] = useState(false);

  useEffect(() => {
    // Clear customer tokens from local storage so they don't persist finished sessions
    const customerToken = localStorage.getItem('nexus_customer_token');
    if (customerToken) {
      localStorage.removeItem('nexus_customer_token');
      localStorage.removeItem('nexus_customer_session');
      setIsAgent(false);
    } else if (user) {
      setIsAgent(true);
    }
  }, [user]);

  const handleAction = () => {
    if (isAgent) {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="ended-page">
      {/* Background Ambient */}
      <div className="ended-page__ambient">
        <div className="ended-page__orb ended-page__orb--1" />
        <div className="ended-page__orb ended-page__orb--2" />
      </div>

      <motion.div
        className="ended-card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="ended-card__header">
          <NexusLogo size={56} />
          <div className="ended-success-badge">
            <CheckCircle size={24} />
          </div>
          <h1 className="ended-card__title">Session Ended</h1>
          <p className="ended-card__subtitle">
            {isAgent
              ? 'You have successfully concluded the remote support call.'
              : 'Thank you for using NEXUS SUPPORT. Your session has finished.'}
          </p>
        </div>

        <div className="ended-card__divider" />

        <div className="ended-card__body">
          <p className="ended-info-text">
            {isAgent
              ? 'The session has been logged and the database updated with participants durations. All WebRTC stream transports have been closed securely.'
              : 'The connection has been terminated securely. No background resources are active.'}
          </p>
        </div>

        <div className="ended-card__actions">
          <Button
            onClick={handleAction}
            variant="primary"
            size="lg"
            fullWidth
          >
            {isAgent ? (
              <>
                <Home size={18} />
                Return to Dashboard
              </>
            ) : (
              <>
                <LogOut size={18} />
                Exit Portal
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};
