import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './providers/AuthProvider';
import { SocketProvider } from './providers/SocketProvider';
import { MediasoupProvider } from './providers/MediasoupProvider';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { JoinPage } from './pages/JoinPage';
import { SessionPage } from './pages/SessionPage';
import { SessionEndedPage } from './pages/SessionEndedPage';
import { AdminPage } from './pages/AdminPage';
import { NexusLogo } from './components/ui/NexusLogo';
import './pages/LoginPage.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Full-page loading spinner */
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-4)',
      background: 'var(--bg-primary)',
    }}>
      <NexusLogo size={64} animate />
      <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
        Loading...
      </p>
    </div>
  );
}

/** Protected Route Wrapper */
function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

/** Call Route Wrapper (Supports Agent auth or Customer guest token) */
function CallRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated: isAgentAuthenticated, isLoading: isAgentLoading } = useAuth();
  const { id: sessionId } = useParams<{ id: string }>();

  // Check customer session
  const customerToken = localStorage.getItem('nexus_customer_token');
  const customerSessionStr = localStorage.getItem('nexus_customer_session');

  let isCustomerValid = false;
  if (customerToken && customerSessionStr) {
    try {
      const session = JSON.parse(customerSessionStr);
      if (session.id === sessionId) {
        isCustomerValid = true;
      }
    } catch {}
  }

  if (isAgentLoading) return <PageLoader />;

  if (isAgentAuthenticated || isCustomerValid) {
    return <>{children}</>;
  }

  return <Navigate to="/login" replace />;
}

/** Placeholder for pages not yet built */
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-4)',
      background: 'var(--bg-primary)',
    }}>
      <NexusLogo size={56} />
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}>{title}</h1>
      <p style={{ color: 'var(--text-secondary)' }}>Coming in the next phase.</p>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/join/:token" element={<JoinPage />} />

      {/* Public Dashboard (Actions inside check auth state) */}
      <Route path="/dashboard" element={<DashboardPage />} />

      {/* Agent & Customer call room routes */}
      <Route path="/sessions/:id" element={<CallRoute><SessionPage /></CallRoute>} />
      <Route path="/sessions/:id/ended" element={<CallRoute><SessionEndedPage /></CallRoute>} />

      {/* Admin Protected */}
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />

      {/* 404 */}
      <Route path="*" element={<PlaceholderPage title="Page Not Found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <MediasoupProvider>
            <BrowserRouter>
              <AppRoutes />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#1a1a2e',
                    color: '#f2ede8',
                    border: '1px solid #2a2a3e',
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '14px',
                  },
                  success: {
                    iconTheme: { primary: '#5aad78', secondary: '#f2ede8' },
                  },
                  error: {
                    iconTheme: { primary: '#d94040', secondary: '#f2ede8' },
                  },
                }}
              />
            </BrowserRouter>
          </MediasoupProvider>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
