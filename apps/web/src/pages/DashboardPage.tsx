import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, LogOut, Shield, LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { NexusLogo } from '../components/ui/NexusLogo';
import { Button } from '../components/ui/Button';
import { SessionList } from '../components/dashboard/SessionList';
import { CreateSessionModal } from '../components/dashboard/CreateSessionModal';
import './DashboardPage.css';

export const DashboardPage: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleCreateSessionClick = () => {
    if (!isAuthenticated) {
      toast.error('Please sign in or register to create a new session.');
      navigate('/login');
      return;
    }
    setShowCreateModal(true);
  };

  return (
    <div className="dashboard-page">
      {/* ── Header ── */}
      <header className="dashboard-header">
        <div className="dashboard-header__left">
          <NexusLogo size={36} />
          <div>
            <h1 className="dashboard-header__title">NEXUS SUPPORT</h1>
            <p className="dashboard-header__subtitle">Agent Dashboard</p>
          </div>
        </div>

        <div className="dashboard-header__right">
          {isAuthenticated ? (
            <>
              <div className="dashboard-header__user">
                <span className="dashboard-header__name">{user?.displayName}</span>
                <span className="dashboard-header__role">{user?.role}</span>
              </div>

              {user?.role === 'admin' && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                  <Shield size={16} />
                  Admin
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut size={16} />
                Logout
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              <LogIn size={16} />
              Sign In / Register
            </Button>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="dashboard-main">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ── Action Bar ── */}
          <div className="dashboard-actions">
            <div>
              <h2 className="dashboard-actions__title">Sessions</h2>
              <p className="dashboard-actions__subtitle">Manage your support sessions</p>
            </div>
            <Button variant="primary" onClick={handleCreateSessionClick}>
              <Plus size={18} />
              New Session
            </Button>
          </div>

          {/* ── Session List ── */}
          <SessionList />
        </motion.div>
      </main>

      {/* ── Create Session Modal ── */}
      <CreateSessionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
};
