import { Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { createSessionRouter, mediasoupConfig } from '../config/mediasoup';
import { ReconnectService } from '../services/reconnect.service';
import { SessionService } from '../services/session.service';
import { prisma } from '../lib/prisma';
import { isAgentPayload } from '../middleware/auth.middleware';
import { JwtPayload } from '../types';
import { recordProducer } from '../services/recording.service';

// ── In-Memory Mediasoup Rooms Store ──
export interface Participant {
  id: string; // userId for agents/admins, name/identity for customers
  displayName: string;
  role: 'agent' | 'admin' | 'customer';
  socketId: string;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

export interface Room {
  sessionId: string;
  router: Router;
  participants: Map<string, Participant>;
}

export const rooms = new Map<string, Room>();

export function registerMediasoupHandlers(namespace: Namespace): void {
  namespace.on('connection', (socket: Socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected to /mediasoup namespace');

    let currentSessionId: string | null = null;
    let currentParticipantId: string | null = null;

    // ── Join Room Signaling ──
    socket.on('room:join', async (
      payload: { sessionId: string; token: string },
      callback: (res: { success: boolean; rtpCapabilities?: any; error?: string }) => void
    ) => {
      const { sessionId, token } = payload;
      logger.info({ sessionId, socketId: socket.id }, 'Join room requested');

      try {
        // 1. Verify token
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        const isAgent = decoded.role === 'agent' || decoded.role === 'admin';
        const participantId = isAgent ? decoded.userId : decoded.identity;
        const displayName = decoded.displayName || decoded.identity || 'Customer';
        // ParticipantRole enum only has 'agent' | 'customer'. Map 'admin' → 'agent' for DB storage.
        const role = (decoded.role === 'admin' || decoded.role === 'agent') ? 'agent' : 'customer';

        // 2. Validate session exists in database
        const dbSession = await prisma.session.findUnique({
          where: { id: sessionId },
        });

        if (!dbSession) {
          return callback({ success: false, error: 'Session not found in database' });
        }

        if (dbSession.status === 'ended') {
          return callback({ success: false, error: 'Session has already ended' });
        }

        currentSessionId = sessionId;
        currentParticipantId = participantId;

        // 3. Clear any existing disconnect grace timers
        const wasInGrace = ReconnectService.clearDisconnect(sessionId, participantId);

        // 4. Retrieve or create Room state
        let room = rooms.get(sessionId);
        if (!room) {
          logger.info({ sessionId }, 'Creating new mediasoup router for session');
          const router = await createSessionRouter();
          room = {
            sessionId,
            router,
            participants: new Map(),
          };
          rooms.set(sessionId, room);

          // Update session status in DB to active if it was waiting
          if (dbSession.status === 'waiting') {
            await prisma.session.update({
              where: { id: sessionId },
              data: { status: 'active' },
            });
            logger.info({ sessionId }, 'Session status updated to active');
          }
        }

        // 5. Build Participant state
        let participant = room.participants.get(participantId);
        if (participant) {
          // If already in room, update socket ID
          participant.socketId = socket.id;
          logger.debug({ participantId, sessionId }, 'Participant re-bound socket ID');
        } else {
          participant = {
            id: participantId,
            displayName,
            role,
            socketId: socket.id,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map(),
          };
          room.participants.set(participantId, participant);
        }

        // Join socket.io channel
        socket.join(sessionId);

        // 6. DB Participant join event
        const activeDbParticipant = await prisma.sessionParticipant.findFirst({
          where: { sessionId, identity: participantId, leftAt: null },
        });

        if (!activeDbParticipant) {
          await prisma.sessionParticipant.create({
            data: {
              sessionId,
              identity: participantId,
              role,
            },
          });
        }

        // Log join event in DB
        await prisma.sessionEvent.create({
          data: {
            sessionId,
            eventType: wasInGrace ? 'reconnected' : 'joined',
            actorIdentity: participantId,
            actorRole: role,
          },
        });

        // Notify others in the room
        socket.to(sessionId).emit('participant:joined', {
          participantId,
          displayName,
          role,
        });

        logger.info({ sessionId, participantId, role }, 'Participant joined room successfully');

        // Respond with router capabilities
        callback({
          success: true,
          rtpCapabilities: room.router.rtpCapabilities,
        });
      } catch (err: any) {
        logger.error({ err, sessionId }, 'Error joining mediasoup room');
        callback({ success: false, error: err.message || 'Authentication failed' });
      }
    });

    // ── Create WebRtcTransport ──
    socket.on('transport:create', async (
      payload: { type: 'send' | 'recv' },
      callback: (res: { success: boolean; transportParams?: any; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId) {
        return callback({ success: false, error: 'Not joined in room' });
      }

      const room = rooms.get(currentSessionId);
      const participant = room?.participants.get(currentParticipantId);

      if (!room || !participant) {
        return callback({ success: false, error: 'Room or Participant state missing' });
      }

      try {
        const { webRtcTransport: transportConfig } = mediasoupConfig;

        const transport = await room.router.createWebRtcTransport({
          listenIps: transportConfig.listenIps,
          enableUdp: transportConfig.enableUdp,
          enableTcp: transportConfig.enableTcp,
          preferUdp: transportConfig.preferUdp,
          initialAvailableOutgoingBitrate: transportConfig.initialAvailableOutgoingBitrate,
        });

        // Handle transport events
        transport.on('dtlsstatechange', (dtlsState) => {
          if (dtlsState === 'failed' || dtlsState === 'closed') {
            logger.warn({ transportId: transport.id, dtlsState }, 'WebRtcTransport DTLS state change');
          }
        });

        // Store transport reference
        participant.transports.set(transport.id, transport);

        callback({
          success: true,
          transportParams: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });

        logger.debug(
          { transportId: transport.id, type: payload.type, participantId: participant.id },
          'WebRtcTransport created'
        );
      } catch (err: any) {
        logger.error({ err }, 'Error creating WebRtcTransport');
        callback({ success: false, error: err.message || 'Failed to create transport' });
      }
    });

    // ── Connect WebRtcTransport ──
    socket.on('transport:connect', async (
      payload: { transportId: string; dtlsParameters: any },
      callback: (res: { success: boolean; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId) {
        return callback({ success: false, error: 'Not joined in room' });
      }

      const room = rooms.get(currentSessionId);
      const participant = room?.participants.get(currentParticipantId);
      const transport = participant?.transports.get(payload.transportId);

      if (!transport) {
        return callback({ success: false, error: 'Transport not found' });
      }

      try {
        await transport.connect({ dtlsParameters: payload.dtlsParameters });
        callback({ success: true });
        logger.debug({ transportId: transport.id }, 'WebRtcTransport connected');
      } catch (err: any) {
        logger.error({ err }, 'Error connecting WebRtcTransport');
        callback({ success: false, error: err.message || 'Failed to connect transport' });
      }
    });

    // ── Create Producer (Publish Media) ──
    socket.on('producer:create', async (
      payload: { transportId: string; kind: 'audio' | 'video'; rtpParameters: any; appData?: any },
      callback: (res: { success: boolean; producerId?: string; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId) {
        return callback({ success: false, error: 'Not joined in room' });
      }

      const room = rooms.get(currentSessionId);
      const participant = room?.participants.get(currentParticipantId);
      if (!participant) {
        return callback({ success: false, error: 'Participant not found' });
      }

      const transport = participant.transports.get(payload.transportId);
      if (!transport) {
        return callback({ success: false, error: 'Transport not found' });
      }

      try {
        const producer = await transport.produce({
          kind: payload.kind,
          rtpParameters: payload.rtpParameters,
          appData: payload.appData || {},
        });

        // Store producer reference
        participant.producers.set(producer.id, producer);

        // Handle producer events
        producer.on('transportclose', () => {
          logger.debug({ producerId: producer.id }, 'Producer transport closed');
          participant.producers.delete(producer.id);
        });

        callback({ success: true, producerId: producer.id });

        // Broadcast new producer to other participants
        socket.to(currentSessionId).emit('producer:available', {
          participantId: currentParticipantId,
          producerId: producer.id,
          kind: producer.kind,
          appData: producer.appData,
        });

        // Record dynamically if recording is active for this session
        recordProducer(currentSessionId, producer).catch((err: any) => {
          logger.error({ err, sessionId: currentSessionId, producerId: producer.id }, 'Failed to record new producer dynamically');
        });

        logger.info(
          { producerId: producer.id, kind: producer.kind, participantId: participant.id },
          'Producer created successfully'
        );
      } catch (err: any) {
        logger.error({ err }, 'Error creating Producer');
        callback({ success: false, error: err.message || 'Failed to create producer' });
      }
    });

    // ── Create Consumer (Subscribe Media) ──
    socket.on('consumer:create', async (
      payload: { transportId: string; producerId: string; rtpCapabilities: any },
      callback: (res: { success: boolean; consumerParams?: any; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId) {
        return callback({ success: false, error: 'Not joined in room' });
      }

      const room = rooms.get(currentSessionId);
      const participant = room?.participants.get(currentParticipantId);
      const transport = participant?.transports.get(payload.transportId);

      if (!room || !participant || !transport) {
        return callback({ success: false, error: 'State missing for consumer creation' });
      }

      // Find the producer in the room (belonging to another participant)
      let targetProducer: Producer | null = null;
      let targetParticipantId: string | null = null;

      for (const [pId, p] of room.participants.entries()) {
        if (pId === currentParticipantId) continue;
        const prod = p.producers.get(payload.producerId);
        if (prod) {
          targetProducer = prod;
          targetParticipantId = pId;
          break;
        }
      }

      if (!targetProducer || !targetParticipantId) {
        return callback({ success: false, error: 'Target producer not found in room' });
      }

      // Check if client can consume the producer
      if (!room.router.canConsume({ producerId: targetProducer.id, rtpCapabilities: payload.rtpCapabilities })) {
        return callback({ success: false, error: 'Client capabilities cannot consume this producer' });
      }

      try {
        const consumer = await transport.consume({
          producerId: targetProducer.id,
          rtpCapabilities: payload.rtpCapabilities,
          paused: true, // Start paused, resume upon client request
        });

        // Store consumer reference
        participant.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
          logger.debug({ consumerId: consumer.id }, 'Consumer transport closed');
          participant.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
          logger.debug({ consumerId: consumer.id }, 'Consumer producer closed');
          socket.emit('consumer:closed', { consumerId: consumer.id });
          participant.consumers.delete(consumer.id);
        });

        callback({
          success: true,
          consumerParams: {
            id: consumer.id,
            producerId: targetProducer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          },
        });

        logger.debug(
          { consumerId: consumer.id, producerId: targetProducer.id, participantId: participant.id },
          'Consumer created successfully'
        );
      } catch (err: any) {
        logger.error({ err }, 'Error creating Consumer');
        callback({ success: false, error: err.message || 'Failed to create consumer' });
      }
    });

    // ── Resume Consumer ──
    socket.on('consumer:resume', async (
      payload: { consumerId: string },
      callback: (res: { success: boolean; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId) {
        return callback({ success: false, error: 'Not joined' });
      }

      const room = rooms.get(currentSessionId);
      const participant = room?.participants.get(currentParticipantId);
      const consumer = participant?.consumers.get(payload.consumerId);

      if (!consumer) {
        return callback({ success: false, error: 'Consumer not found' });
      }

      try {
        await consumer.resume();
        callback({ success: true });
        logger.debug({ consumerId: consumer.id }, 'Consumer resumed');
      } catch (err: any) {
        logger.error({ err }, 'Error resuming Consumer');
        callback({ success: false, error: err.message || 'Failed to resume consumer' });
      }
    });

    // ── Fetch Available Producers ──
    socket.on('room:get-producers', (
      payload: any,
      callback?: (res: { success: boolean; producers?: Array<{ producerId: string; participantId: string; kind: string; appData: any }> }) => void
    ) => {
      let actualCallback = callback;
      if (typeof payload === 'function') {
        actualCallback = payload;
      }

      if (!currentSessionId || !currentParticipantId) {
        if (actualCallback) actualCallback({ success: false });
        return;
      }

      const room = rooms.get(currentSessionId);
      if (!room) {
        if (actualCallback) actualCallback({ success: false });
        return;
      }

      const list: Array<{ producerId: string; participantId: string; kind: string; appData: any }> = [];

      for (const [pId, p] of room.participants.entries()) {
        if (pId === currentParticipantId) continue;
        for (const [prodId, prod] of p.producers.entries()) {
          list.push({
            producerId: prodId,
            participantId: pId,
            kind: prod.kind,
            appData: prod.appData,
          });
        }
      }

      if (actualCallback) actualCallback({ success: true, producers: list });
    });

    // ── Close Producer ──
    socket.on('producer:close', (
      payload: { producerId: string },
      callback?: (res: { success: boolean }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId) {
        if (callback) callback({ success: false });
        return;
      }

      const room = rooms.get(currentSessionId);
      const participant = room?.participants.get(currentParticipantId);
      const producer = participant?.producers.get(payload.producerId);

      if (producer) {
        producer.close();
        participant?.producers.delete(payload.producerId);
        socket.to(currentSessionId).emit('producer:closed', { producerId: payload.producerId });
        logger.info({ producerId: payload.producerId }, 'Producer closed by client request');
      }

      if (callback) callback({ success: true });
    });

    // ── Disconnect Handlers ──
    socket.on('disconnect', () => {
      if (!currentSessionId || !currentParticipantId) return;

      const sessionId = currentSessionId;
      const participantId = currentParticipantId;
      const room = rooms.get(sessionId);
      const participant = room?.participants.get(participantId);

      if (!room || !participant) return;

      // Determine role
      const role = participant.role;

      // Start Reconnect grace window
      ReconnectService.registerDisconnect(sessionId, participantId, role, async () => {
        // --- GRACE WINDOW EXPIRED: Clean up participant ---
        logger.info({ sessionId, participantId, role }, 'Grace period expired. Cleaning up participant state.');

        const activeRoom = rooms.get(sessionId);
        const activeParticipant = activeRoom?.participants.get(participantId);

        if (activeRoom && activeParticipant) {
          // 1. Close all producers, consumers, and transports
          for (const consumer of activeParticipant.consumers.values()) {
            try { consumer.close(); } catch {}
          }
          for (const producer of activeParticipant.producers.values()) {
            try { producer.close(); } catch {}
          }
          for (const transport of activeParticipant.transports.values()) {
            try { transport.close(); } catch {}
          }

          // 2. Remove participant from room
          activeRoom.participants.delete(participantId);

          // 3. Notify remaining participants
          namespace.to(sessionId).emit('participant:left', { participantId });

          // 4. Update Database
          const now = new Date();
          const dbParticipant = await prisma.sessionParticipant.findFirst({
            where: { sessionId, identity: participantId, leftAt: null },
          });

          if (dbParticipant) {
            const duration = Math.floor((now.getTime() - dbParticipant.joinedAt.getTime()) / 1000);
            await prisma.sessionParticipant.update({
              where: { id: dbParticipant.id },
              data: { leftAt: now, totalDurationSeconds: duration },
            });
          }

          await prisma.sessionEvent.create({
            data: {
              sessionId,
              eventType: 'left',
              actorIdentity: participantId,
              actorRole: (role === 'admin' || role === 'agent') ? 'agent' : 'customer',
            },
          });

          // 5. Clean up Room if empty or end session if Agent disconnected
          if (role === 'agent' || role === 'admin') {
            logger.info({ sessionId }, 'Agent left and grace window expired. Ending session.');
            await SessionService.endSession(sessionId, participantId, 'agent');
            
            // Emit end session to all sockets in the channel
            namespace.to(sessionId).emit('session:ended');

            // Close entire room resources
            for (const p of activeRoom.participants.values()) {
              for (const c of p.consumers.values()) { try { c.close(); } catch {} }
              for (const pr of p.producers.values()) { try { pr.close(); } catch {} }
              for (const t of p.transports.values()) { try { t.close(); } catch {} }
            }
            try { activeRoom.router.close(); } catch {}
            rooms.delete(sessionId);
          } else {
            // If it's a customer and room is empty, close it
            if (activeRoom.participants.size === 0) {
              logger.info({ sessionId }, 'Room is empty. Closing router.');
              try { activeRoom.router.close(); } catch {}
              rooms.delete(sessionId);
            }
          }
        }
      });
    });
  });

  logger.debug('mediasoup socket handlers registered');
}
