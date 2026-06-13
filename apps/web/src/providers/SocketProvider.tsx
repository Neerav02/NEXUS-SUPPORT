import React, { createContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

interface SocketContextType {
  sessionSocket: Socket | null;
  mediasoupSocket: Socket | null;
  chatSocket: Socket | null;
  isConnected: boolean;
}

export const SocketContext = createContext<SocketContextType>({
  sessionSocket: null,
  mediasoupSocket: null,
  chatSocket: null,
  isConnected: false,
});

interface SocketProviderProps {
  children: React.ReactNode;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8080';

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { token: agentToken, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  const sessionSocketRef = useRef<Socket | null>(null);
  const mediasoupSocketRef = useRef<Socket | null>(null);
  const chatSocketRef = useRef<Socket | null>(null);

  // Determine the active token: agent JWT takes priority, fall back to customer guest JWT
  const customerToken = typeof window !== 'undefined' ? localStorage.getItem('nexus_customer_token') : null;
  const activeToken = agentToken || customerToken;
  const shouldConnect = isAuthenticated || !!customerToken;

  useEffect(() => {
    if (!shouldConnect || !activeToken) {
      // Disconnect all sockets when no valid identity exists
      sessionSocketRef.current?.disconnect();
      mediasoupSocketRef.current?.disconnect();
      chatSocketRef.current?.disconnect();
      sessionSocketRef.current = null;
      mediasoupSocketRef.current = null;
      chatSocketRef.current = null;
      setIsConnected(false);
      return;
    }

    // Create Socket.io connections for each namespace
    const socketOptions = {
      auth: { token: activeToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    };

    sessionSocketRef.current = io(`${SOCKET_URL}/session`, socketOptions);
    mediasoupSocketRef.current = io(`${SOCKET_URL}/mediasoup`, socketOptions);
    chatSocketRef.current = io(`${SOCKET_URL}/chat`, socketOptions);

    // Track connection state via session socket
    sessionSocketRef.current.on('connect', () => {
      setIsConnected(true);
    });

    sessionSocketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    return () => {
      sessionSocketRef.current?.disconnect();
      mediasoupSocketRef.current?.disconnect();
      chatSocketRef.current?.disconnect();
    };
  }, [shouldConnect, activeToken]);

  return (
    <SocketContext.Provider
      value={{
        sessionSocket: sessionSocketRef.current,
        mediasoupSocket: mediasoupSocketRef.current,
        chatSocket: chatSocketRef.current,
        isConnected,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
