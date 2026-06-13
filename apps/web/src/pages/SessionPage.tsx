import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediasoup } from '../hooks/useMediasoup';
import { SocketContext } from '../providers/SocketProvider';
import { useAuth } from '../hooks/useAuth';
import { VideoGrid } from '../components/call/VideoGrid';
import { ControlBar } from '../components/call/ControlBar';
import { RecordingIndicator } from '../components/call/RecordingIndicator';
import { NexusLogo } from '../components/ui/NexusLogo';
import { MessageSquare, Send, X, ShieldAlert, Paperclip, File, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import './SessionPage.css';

// ── Types ──────────────────────────────────────────────────────────────────

type RecordingStatus = 'none' | 'recording' | 'processing' | 'ready' | 'failed';

interface ChatMessage {
  id: string;
  senderIdentity: string;
  senderRole: string;
  content?: string;
  messageType: 'text' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (secs: number): string => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

/**
 * Decode the JWT and extract the participant identity string.
 * For agents: returns userId.
 * For customers: returns the display name (identity field).
 */
const extractIdentityFromToken = (token: string): string => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return '';
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    return decoded.role === 'agent' || decoded.role === 'admin'
      ? decoded.userId
      : decoded.identity;
  } catch {
    return '';
  }
};

// ── Component ──────────────────────────────────────────────────────────────

export const SessionPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const { joinCall, leaveCall, isInCall, isConnecting, error: callError } = useMediasoup();
  const { chatSocket, sessionSocket } = useContext(SocketContext);

  // ── Session State ──
  const [sessionTitle, setSessionTitle] = useState('Support Call');
  const [isAgent, setIsAgent] = useState(false);

  // ── UI State ──
  const [chatOpen, setChatOpen] = useState(true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // ── Chat State ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  // ── Recording State ──
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('none');
  const [recordingDownloadUrl, setRecordingDownloadUrl] = useState<string>('');

  // ── Refs ──
  const messageEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived Values ──
  const clientToken = token || localStorage.getItem('nexus_customer_token') || '';

  const currentParticipantId: string = (() => {
    if (clientToken) {
      const fromToken = extractIdentityFromToken(clientToken);
      if (fromToken) return fromToken;
    }
    if (user?.userId) return user.userId;
    try {
      return JSON.parse(localStorage.getItem('nexus_customer_session') || '{}').identity || '';
    } catch {
      return '';
    }
  })();

  // ── Load Session Metadata ──────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !clientToken) return;

    const fetchSession = async () => {
      try {
        const res = await api.get(`/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${clientToken}` },
        });
        const data = res.data.data;
        setSessionTitle(data.title);

        const status = (data.recordingStatus || 'none').toLowerCase() as RecordingStatus;
        setRecordingStatus(status);

        const currentUserRole = user?.role ?? 'customer';
        setIsAgent(currentUserRole === 'agent' || currentUserRole === 'admin');
      } catch {
        // Fallback for customer — read from localStorage session cache
        try {
          const stored = JSON.parse(localStorage.getItem('nexus_customer_session') || '{}');
          if (stored.id === sessionId) {
            setSessionTitle(stored.title ?? 'Support Call');
            setRecordingStatus((stored.recordingStatus ?? 'none').toLowerCase() as RecordingStatus);
            setIsAgent(false);
            return;
          }
        } catch { }
        toast.error('Failed to load session details');
      }
    };

    fetchSession();
  }, [sessionId, clientToken, user]);

  // ── WebRTC Join / Leave ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !clientToken) return;
    joinCall(sessionId);
    return () => {
      leaveCall();
    };
  }, [sessionId, clientToken]);

  // ── Chat Socket Handlers ──────────────────────────────────────────────

  useEffect(() => {
    if (!chatSocket || !sessionId || !clientToken) return;

    chatSocket.emit('chat:join', { sessionId, token: clientToken }, (res: any) => {
      if (!res?.success) {
        toast.error('Failed to connect to chat messaging');
      }
    });

    chatSocket.on('chat:message', (message: ChatMessage) => {
      setMessages((prev) => {
        // Prevent duplicate messages (same id from history + socket)
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    return () => {
      chatSocket.off('chat:message');
    };
  }, [chatSocket, sessionId, clientToken]);

  // ── Session Socket Handlers ───────────────────────────────────────────

  useEffect(() => {
    if (!sessionSocket || !sessionId || !clientToken) return;

    sessionSocket.emit('session:join', { sessionId, token: clientToken }, (res: any) => {
      if (!res?.success) {
        console.error('Failed to join session state channel', res);
      }
    });

    // Session ended by agent or server
    sessionSocket.on('session:ended', () => {
      toast.error('The support session has been ended.');
      navigate(`/sessions/${sessionId}/ended`);
    });

    // Recording status updates pushed from server
    sessionSocket.on('recording:status', (data: { sessionId: string; status: string }) => {
      if (data.sessionId !== sessionId) return;
      const normalized = data.status.toLowerCase() as RecordingStatus;
      setRecordingStatus(normalized);

      if (normalized === 'recording') {
        toast('Call recording started', { icon: '🔴' });
      } else if (normalized === 'processing') {
        toast('Recording stopped — processing video on server...', { icon: '⏳' });
      } else if (normalized === 'failed') {
        toast.error('Recording failed on server');
      }
    });

    // Recording ready — download URL available
    sessionSocket.on(
      'recording:ready',
      (data: { sessionId: string; downloadUrl: string; recordingId: string }) => {
        if (data.sessionId !== sessionId) return;
        setRecordingStatus('ready');
        const fullUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}${data.downloadUrl}`;
        setRecordingDownloadUrl(fullUrl);
        toast.success('Recording is ready — click the badge to download', { duration: 6000 });
      }
    );

    // Legacy event names emitted by older socket handler (backward compat)
    sessionSocket.on('recording:started', () => {
      setRecordingStatus('recording');
    });

    sessionSocket.on('recording:stopped', () => {
      setRecordingStatus('processing');
    });

    return () => {
      sessionSocket.off('session:ended');
      sessionSocket.off('recording:status');
      sessionSocket.off('recording:ready');
      sessionSocket.off('recording:started');
      sessionSocket.off('recording:stopped');
    };
  }, [sessionSocket, sessionId, clientToken, navigate]);

  // ── Chat History (REST) ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !clientToken) return;

    const fetchHistory = async () => {
      try {
        const res = await api.get(`/sessions/${sessionId}/chat`, {
          headers: { Authorization: `Bearer ${clientToken}` },
        });
        setMessages(res.data.data ?? []);
      } catch {
        // Non-fatal — chat history failure should not block the call
      }
    };

    fetchHistory();
  }, [sessionId, clientToken]);

  // ── Call Timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isInCall) return;
    const timer = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isInCall]);

  // ── Auto-scroll Chat ──────────────────────────────────────────────────

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  // ── Recording Controls ────────────────────────────────────────────────

  const handleStartRecording = () => {
    if (!sessionSocket) {
      toast.error('Not connected to session');
      return;
    }
    sessionSocket.emit('recording:start', { sessionId }, (res: any) => {
      if (res?.error) {
        toast.error(res.error);
      }
      // Status update comes through the recording:status socket event
    });
  };

  const handleStopRecording = () => {
    if (!sessionSocket) {
      toast.error('Not connected to session');
      return;
    }
    sessionSocket.emit('recording:stop', { sessionId }, (res: any) => {
      if (res?.error) {
        toast.error(res.error);
      }
    });
  };

  const handleToggleRecording = () => {
    if (recordingStatus === 'recording') {
      handleStopRecording();
    } else if (recordingStatus === 'none' || recordingStatus === 'failed') {
      handleStartRecording();
    }
  };

  // ── Chat Controls ─────────────────────────────────────────────────────

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !chatSocket) return;

    chatSocket.emit(
      'chat:send',
      { content: chatInput.trim(), messageType: 'text' },
      (res: any) => {
        if (!res?.success) {
          toast.error(res?.error || 'Failed to send message');
        } else {
          setChatInput('');
        }
      }
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size exceeds 20MB limit');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingFile(true);
    try {
      await api.post(`/sessions/${sessionId}/files`, formData, {
        headers: {
          Authorization: `Bearer ${clientToken}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('File uploaded successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Session End ───────────────────────────────────────────────────────

  const handleLeaveCall = () => {
    if (isAgent) {
      setShowEndConfirm(true);
    } else {
      leaveCall();
      navigate(`/sessions/${sessionId}/ended`);
    }
  };

  const handleConfirmEnd = () => {
    if (!sessionSocket) {
      toast.error('Not connected to session');
      return;
    }
    setShowEndConfirm(false);
    sessionSocket.emit('session:end', { sessionId }, (res: any) => {
      if (res?.success) {
        leaveCall();
        navigate(`/sessions/${sessionId}/ended`);
      } else {
        toast.error(res?.error || 'Failed to end session');
      }
    });
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="session-page">

      {/* ── Top Header ── */}
      <header className="session-header">
        <div className="header-left">
          <NexusLogo size={32} animate={isConnecting} />
          <div className="header-meta">
            <h1>{sessionTitle}</h1>
            <span className="session-timer">{formatTime(elapsedSeconds)}</span>
          </div>
        </div>

        <div className="header-right">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`header-chat-btn ${chatOpen ? 'chat-active' : ''}`}
            title="Toggle Chat"
          >
            <MessageSquare size={18} />
            <span className="btn-label-desktop">Chat</span>
            {messages.length > 0 && (
              <span className="chat-badge">{messages.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Main Panel Layout ── */}
      <div className="session-body">

        {/* ── Video Pane ── */}
        <main className="session-video-pane">

          {/* Recording floating badge — sits above video */}
          <RecordingIndicator
            status={recordingStatus}
            downloadUrl={recordingDownloadUrl}
          />

          {callError ? (
            <div className="call-error-state">
              <ShieldAlert size={48} className="error-icon" />
              <h2>Connection Failed</h2>
              <p>{callError}</p>
              <button
                onClick={() => window.location.reload()}
                className="retry-btn"
              >
                Retry Connection
              </button>
            </div>
          ) : isConnecting ? (
            <div className="call-loading-state">
              <NexusLogo size={64} animate />
              <h2>Connecting to Secure Server...</h2>
              <p>Setting up encrypted real-time streams</p>
            </div>
          ) : (
            <VideoGrid />
          )}

          {/* Floating Control Bar Overlay */}
          <div className="session-controls-overlay">
            <ControlBar
              onLeave={handleLeaveCall}
              isAgent={isAgent}
              recordingStatus={recordingStatus}
              onToggleRecording={handleToggleRecording}
            />
          </div>
        </main>

        {/* ── Chat Sidebar ── */}
        <aside
          className={`session-chat-sidebar ${chatOpen ? 'sidebar-open' : 'sidebar-closed'
            }`}
        >
          <div className="chat-sidebar-header">
            <h3>Live Chat</h3>
            <button
              onClick={() => setChatOpen(false)}
              className="close-sidebar-btn"
            >
              <X size={18} />
            </button>
          </div>

          <div className="chat-sidebar-history">
            {messages.length === 0 ? (
              <div className="chat-empty-state">
                <MessageSquare size={36} className="empty-icon" />
                <p>No messages yet. Send a message to start conversing.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isSelf = msg.senderIdentity === currentParticipantId;
                const initials = (msg.senderIdentity ?? 'XX').slice(0, 2).toUpperCase();
                const isFile = msg.messageType === 'file';
                const fileDownloadUrl = isFile && msg.fileUrl
                  ? `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}${msg.fileUrl}`
                  : '';
                const senderLabel =
                  msg.senderRole === 'agent' || msg.senderRole === 'admin'
                    ? 'Agent'
                    : 'Customer';

                return (
                  <div
                    key={msg.id}
                    className={`chat-bubble-wrapper ${isSelf ? 'bubble-self' : 'bubble-other'
                      }`}
                  >
                    <div className="bubble-avatar">{initials}</div>

                    <div className="bubble-content-wrapper">
                      <div className="bubble-header-meta">
                        <span className="bubble-sender-name">{senderLabel}</span>
                        <span className="bubble-time">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="bubble-text">
                        {isFile ? (
                          <div className="file-message-card">
                            <div className="file-message-info">
                              <File size={20} className="file-icon" />
                              <div className="file-details">
                                <span
                                  className="file-name"
                                  title={msg.fileName || 'Shared file'}
                                >
                                  {msg.fileName || 'Shared file'}
                                </span>
                                <span className="file-size">
                                  {formatFileSize(msg.fileSize)}
                                </span>
                              </div>
                            </div>

                            href={fileDownloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="file-download-btn"
                            title="Download File"
                            <Download size={14} style={{ marginRight: 4 }} />
                            Download

                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messageEndRef} />
          </div>

          {/* Chat Input Footer */}
          <div className="chat-sidebar-footer">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx"
            />
            <button
              type="button"
              className="attach-file-btn"
              disabled={uploadingFile}
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              <Paperclip
                size={16}
                className={uploadingFile ? 'animate-spin' : ''}
              />
            </button>
            <form onSubmit={handleSendChat} className="chat-input-form">
              <input
                type="text"
                placeholder={
                  uploadingFile ? 'Uploading file...' : 'Type message...'
                }
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={500}
                disabled={uploadingFile}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || uploadingFile}
                className="send-msg-btn"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* ── End Session Confirmation Modal ── */}
      {showEndConfirm && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal-card">
            <div className="confirm-modal-header">
              <ShieldAlert className="warning-icon" size={24} />
              <h2>End Support Session?</h2>
            </div>
            <p>
              Are you sure you want to end this support session? This will
              disconnect the customer and conclude all active streams.
            </p>
            <div className="confirm-modal-actions">
              <button
                className="modal-btn btn-cancel"
                onClick={() => setShowEndConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn btn-confirm-end"
                onClick={handleConfirmEnd}
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};