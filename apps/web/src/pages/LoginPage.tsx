import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { NexusLogo } from '../components/ui/NexusLogo';
import { Button } from '../components/ui/Button';
import toast from 'react-hot-toast';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'agent' | 'admin'>('agent');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        await register(email, password, displayName, role);
        toast.success('Registration successful! Welcome to Nexus Support.');
      } else {
        await login(email, password);
        toast.success('Signed in successfully.');
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
  };

  return (
    <div className="login-page">
      {/* Background Ambient Elements */}
      <div className="login-page__ambient">
        <div className="login-page__orb login-page__orb--1" />
        <div className="login-page__orb login-page__orb--2" />
      </div>

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Logo & Title */}
        <div className="login-card__header">
          <NexusLogo size={56} />
          <h1 className="login-card__title">NEXUS SUPPORT</h1>
          <p className="login-card__subtitle">
            {isRegistering ? 'Create Agent Account' : 'Agent Control Panel'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            className="login-card__error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="login-card__form">
          <AnimatePresence mode="popLayout">
            {isRegistering && (
              <motion.div
                key="register-fields"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
              >
                <div className="login-card__field">
                  <label htmlFor="register-name" className="login-card__label">Display Name</label>
                  <input
                    id="register-name"
                    type="text"
                    placeholder="Support Agent"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required={isRegistering}
                    autoComplete="name"
                  />
                </div>

                <div className="login-card__field">
                  <label className="login-card__label">Account Role</label>
                  <div className="role-selector">
                    <button
                      type="button"
                      className={`role-btn ${role === 'agent' ? 'role-btn--active' : ''}`}
                      onClick={() => setRole('agent')}
                    >
                      Support Agent
                    </button>
                    <button
                      type="button"
                      className={`role-btn ${role === 'admin' ? 'role-btn--active' : ''}`}
                      onClick={() => setRole('admin')}
                    >
                      Admin
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="login-card__field">
            <label htmlFor="login-email" className="login-card__label">Email Address</label>
            <input
              id="login-email"
              type="email"
              placeholder="agent@nexus.support"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="login-card__field">
            <label htmlFor="login-password" className="login-card__label">Password</label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
          >
            {isRegistering ? (
              <>
                <UserPlus size={18} />
                Register Account
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </Button>
        </form>

        {/* Toggle between login and registration */}
        <div className="login-card__toggle">
          {isRegistering ? 'Already have an account?' : "Don't have an agent account?"}
          <button type="button" className="login-card__toggle-btn" onClick={toggleMode}>
            {isRegistering ? 'Sign In' : 'Register Now'}
          </button>
        </div>

        {/* Footer */}
        <p className="login-card__footer">
          {isRegistering ? 'Credentials will be stored securely in Supabase' : 'Secure access for authorized agents only'}
        </p>
      </motion.div>
    </div>
  );
};
