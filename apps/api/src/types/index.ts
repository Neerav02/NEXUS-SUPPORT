// ── NEXUS SUPPORT — Shared TypeScript Types ──

export type UserRole = 'agent' | 'admin';
export type CustomerRole = 'customer';
export type ParticipantRole = UserRole | CustomerRole;

export type SessionStatus = 'waiting' | 'active' | 'ended';
export type RecordingStatus = 'none' | 'recording' | 'processing' | 'ready' | 'failed';
export type MessageType = 'text' | 'file';
export type EventType =
  | 'created'
  | 'joined'
  | 'left'
  | 'recording_started'
  | 'recording_stopped'
  | 'ended'
  | 'reconnected'
  | 'file_shared';

// ── JWT Payloads ──
export interface AgentJwtPayload {
  userId: string;
  role: UserRole;
  displayName: string;
}

export interface CustomerJwtPayload {
  sessionId: string;
  identity: string;
  role: 'customer';
}

export type JwtPayload = AgentJwtPayload | CustomerJwtPayload;

// ── Socket.io Event Types ──
export interface SessionJoinPayload {
  sessionId: string;
  role: ParticipantRole;
}

export interface ChatSendPayload {
  sessionId: string;
  content: string;
  messageType: MessageType;
}

export interface ChatMessagePayload {
  id: string;
  sessionId: string;
  senderIdentity: string;
  senderRole: ParticipantRole;
  content: string | null;
  messageType: MessageType;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface TransportCreatePayload {
  sessionId: string;
  type: 'send' | 'recv';
}

export interface TransportConnectPayload {
  sessionId: string;
  transportId: string;
  dtlsParameters: object;
}

export interface ProducerCreatePayload {
  sessionId: string;
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: object;
}

export interface ConsumerCreatePayload {
  sessionId: string;
  transportId: string;
  producerId: string;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  duration: number;
  participants: Array<{
    identity: string;
    role: ParticipantRole;
    duration: number;
  }>;
  messageCount: number;
  recordingUrl: string | null;
}

// ── API Response Types ──
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
