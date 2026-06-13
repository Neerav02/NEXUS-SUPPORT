import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';
import { SocketContext } from './SocketProvider';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-hot-toast';

export interface RemoteParticipant {
  id: string;
  displayName: string;
  role: 'agent' | 'admin' | 'customer';
  stream: MediaStream;
  screenStream: MediaStream | null;
  videoProducerId?: string;
  audioProducerId?: string;
  screenProducerId?: string;
}

interface MediasoupContextType {
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  isMicMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  isInCall: boolean;
  isConnecting: boolean;
  error: string | null;
  joinCall: (sessionId: string) => Promise<void>;
  leaveCall: () => void;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

export const MediasoupContext = createContext<MediasoupContextType | null>(null);

export const MediasoupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mediasoupSocket } = useContext(SocketContext);
  const { token: agentToken } = useAuth();
  const token = agentToken || localStorage.getItem('nexus_customer_token');

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs to hold Mediasoup Client Instances ──
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<types.Transport | null>(null);
  const recvTransportRef = useRef<types.Transport | null>(null);
  
  const audioProducerRef = useRef<types.Producer | null>(null);
  const videoProducerRef = useRef<types.Producer | null>(null);
  const screenProducerRef = useRef<types.Producer | null>(null);
  
  const consumersRef = useRef<Map<string, types.Consumer>>(new Map()); // consumerId -> Consumer
  const remoteParticipantsRef = useRef<Map<string, RemoteParticipant>>(new Map()); // participantId -> RemoteParticipant

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, []);

  const cleanupCall = () => {
    // Stop local tracks
    localStream?.getTracks().forEach((track) => track.stop());
    localScreenStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setLocalScreenStream(null);

    // Close producers
    audioProducerRef.current?.close();
    videoProducerRef.current?.close();
    screenProducerRef.current?.close();
    audioProducerRef.current = null;
    videoProducerRef.current = null;
    screenProducerRef.current = null;

    // Close consumers
    consumersRef.current.forEach((c) => c.close());
    consumersRef.current.clear();

    // Close transports
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;

    deviceRef.current = null;
    remoteParticipantsRef.current.clear();
    setRemoteParticipants([]);
    
    setIsMicMuted(false);
    setIsCamOff(false);
    setIsScreenSharing(false);
    setIsInCall(false);
    setIsConnecting(false);
  };

  /**
   * Helper to execute socket requests as promises
   */
  const socketRequest = (event: string, data: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!mediasoupSocket) {
        return reject(new Error('Socket disconnected'));
      }
      mediasoupSocket.emit(event, data, (res: any) => {
        if (res.success) {
          resolve(res);
        } else {
          reject(new Error(res.error || `Socket request ${event} failed`));
        }
      });
    });
  };

  /**
   * Join Call room and initialize mediasoup
   */
  const joinCall = async (sessionId: string) => {
    if (!mediasoupSocket) {
      toast.error('Signaling connection not active. Please retry.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // 1. Join room and get router RTP Capabilities
      const joinRes = await socketRequest('room:join', { sessionId, token });
      const { rtpCapabilities } = joinRes;

      // 2. Load device
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;

      // 3. Request user media (mic + camera)
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { max: 30 },
          },
        });
        setLocalStream(stream);
      } catch (err) {
        console.warn('Failed to acquire video + audio; trying audio only', err);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setLocalStream(stream);
          setIsCamOff(true);
        } catch (err2) {
          console.error('Failed to acquire audio-only stream; joining call as listener only', err2);
          toast.error('Microphone access denied. You will join as listener only.');
        }
      }

      // 4. Create local send transport
      const sendTransportParams = await socketRequest('transport:create', { type: 'send' });
      const sendTransport = device.createSendTransport(sendTransportParams.transportParams);
      sendTransportRef.current = sendTransport;

      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRequest('transport:connect', {
            transportId: sendTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (err: any) {
          errback(err);
        }
      });

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const produceRes = await socketRequest('producer:create', {
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          });
          callback({ id: produceRes.producerId });
        } catch (err: any) {
          errback(err);
        }
      });

      // 5. Create local recv transport
      const recvTransportParams = await socketRequest('transport:create', { type: 'recv' });
      const recvTransport = device.createRecvTransport(recvTransportParams.transportParams);
      recvTransportRef.current = recvTransport;

      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRequest('transport:connect', {
            transportId: recvTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (err: any) {
          errback(err);
        }
      });

      // 6. Produce local media tracks
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const audioProducer = await sendTransport.produce({ track: audioTrack, appData: { mediaType: 'mic' } });
          audioProducerRef.current = audioProducer;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const videoProducer = await sendTransport.produce({ track: videoTrack, appData: { mediaType: 'cam' } });
          videoProducerRef.current = videoProducer;
        }
      }

      // 7. Hook socket events for remote participants and producers
      setupSocketListeners();

      // 8. Consume existing producers
      const producersRes = await socketRequest('room:get-producers');
      for (const prod of producersRes.producers) {
        await consumeProducer(prod.producerId, prod.participantId, prod.kind, prod.appData);
      }

      setIsInCall(true);
      toast.success('Joined support call room');
    } catch (err: any) {
      console.error('Error joining mediasoup call', err);
      setError(err.message || 'Failed to join video room');
      cleanupCall();
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Setup socket event handlers
   */
  const setupSocketListeners = () => {
    if (!mediasoupSocket) return;

    // Remove any previous listener to avoid duplicates
    mediasoupSocket.off('producer:available');
    mediasoupSocket.off('producer:closed');
    mediasoupSocket.off('participant:joined');
    mediasoupSocket.off('participant:left');
    mediasoupSocket.off('session:ended');

    mediasoupSocket.on('producer:available', async (data: {
      participantId: string;
      producerId: string;
      kind: 'audio' | 'video';
      appData: any;
    }) => {
      console.log('New producer available from signaling', data);
      await consumeProducer(data.producerId, data.participantId, data.kind, data.appData);
    });

    mediasoupSocket.on('producer:closed', (data: { producerId: string }) => {
      // Find consumer by producer ID
      let foundConsumer: types.Consumer | null = null;
      consumersRef.current.forEach((c) => {
        if (c.producerId === data.producerId) {
          foundConsumer = c;
        }
      });

      if (foundConsumer) {
        closeConsumer((foundConsumer as types.Consumer).id);
      }
    });

    mediasoupSocket.on('participant:joined', (data: { participantId: string; displayName: string; role: any }) => {
      console.log('Remote participant joined', data);
      toast({
        icon: '👋',
        message: `${data.displayName} (${data.role}) joined call`,
      } as any);
    });

    mediasoupSocket.on('participant:left', (data: { participantId: string }) => {
      console.log('Remote participant left', data);
      removeParticipant(data.participantId);
    });

    mediasoupSocket.on('session:ended', () => {
      console.log('Session ended by agent');
      toast.error('This call session has been ended.');
      cleanupCall();
    });
  };

  /**
   * Consume a remote producer
   */
  const consumeProducer = async (
    producerId: string,
    participantId: string,
    _kind: 'audio' | 'video',
    appData: any
  ) => {
    const recvTransport = recvTransportRef.current;
    const device = deviceRef.current;

    if (!recvTransport || !device) return;

    try {
      const consumeParams = await socketRequest('consumer:create', {
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumer = await recvTransport.consume(consumeParams.consumerParams);
      consumersRef.current.set(consumer.id, consumer);

      // Resume on server
      await socketRequest('consumer:resume', { consumerId: consumer.id });

      // Add to participant stream state
      addConsumerToParticipantStream(participantId, consumer, appData);
    } catch (err) {
      console.error('Error consuming remote producer', { err, producerId });
    }
  };

  /**
   * Add consumer track to the participant's MediaStream
   */
  const addConsumerToParticipantStream = (
    participantId: string,
    consumer: types.Consumer,
    appData: any
  ) => {
    let participant = remoteParticipantsRef.current.get(participantId);

    if (!participant) {
      const isAgent = participantId.includes('@') || participantId === 'admin' || participantId.includes('-') && participantId.length > 20;
      participant = {
        id: participantId,
        displayName: isAgent ? 'Support Agent' : 'Customer',
        role: isAgent ? 'agent' : 'customer',
        stream: new MediaStream(),
        screenStream: null,
      };
    }

    const { track } = consumer;
    const mediaType = appData?.mediaType || 'mic';

    if (mediaType === 'screen') {
      participant.screenStream = new MediaStream([track]);
      participant.screenProducerId = consumer.producerId;
    } else {
      participant.stream.addTrack(track);
      if (mediaType === 'mic') {
        participant.audioProducerId = consumer.producerId;
      } else if (mediaType === 'cam') {
        participant.videoProducerId = consumer.producerId;
      }
    }

    remoteParticipantsRef.current.set(participantId, participant);
    setRemoteParticipants(Array.from(remoteParticipantsRef.current.values()));

    console.log('Track added to remote participant stream', { participantId, kind: consumer.kind, producerId: consumer.producerId });
  };

  /**
   * Close a consumer and update participant state
   */
  const closeConsumer = (consumerId: string) => {
    const consumer = consumersRef.current.get(consumerId);
    if (!consumer) return;

    consumer.close();
    consumersRef.current.delete(consumerId);

    // Remove track from matching participant stream
    remoteParticipantsRef.current.forEach((participant) => {
      const { track } = consumer;
      try {
        participant.stream.removeTrack(track);
      } catch {}

      if (participant.audioProducerId === consumer.producerId) {
        participant.audioProducerId = undefined;
      } else if (participant.videoProducerId === consumer.producerId) {
        participant.videoProducerId = undefined;
      } else if (participant.screenProducerId === consumer.producerId) {
        participant.screenStream = null;
        participant.screenProducerId = undefined;
      }
    });

    setRemoteParticipants(Array.from(remoteParticipantsRef.current.values()));
  };

  /**
   * Remove a remote participant
   */
  const removeParticipant = (participantId: string) => {
    const participant = remoteParticipantsRef.current.get(participantId);
    if (participant) {
      participant.stream.getTracks().forEach((track) => track.stop());
      remoteParticipantsRef.current.delete(participantId);
      setRemoteParticipants(Array.from(remoteParticipantsRef.current.values()));
    }
  };

  /**
   * Leave Call
   */
  const leaveCall = () => {
    if (mediasoupSocket) {
      mediasoupSocket.emit('room:leave');
    }
    cleanupCall();
    toast.success('Disconnected from call');
  };

  /**
   * Toggle Microphone
   */
  const toggleMic = async () => {
    if (!audioProducerRef.current) return;

    const producer = audioProducerRef.current;
    if (producer.paused) {
      await producer.resume();
      setIsMicMuted(false);
    } else {
      await producer.pause();
      setIsMicMuted(true);
    }
  };

  /**
   * Toggle Camera
   */
  const toggleCam = async () => {
    if (!videoProducerRef.current) {
      // If camera was off/denied, try to acquire it now
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        const videoTrack = stream.getVideoTracks()[0];
        if (sendTransportRef.current && videoTrack) {
          const videoProducer = await sendTransportRef.current.produce({
            track: videoTrack,
            appData: { mediaType: 'cam' },
          });
          videoProducerRef.current = videoProducer;
          
          // Append to localStream
          localStream?.addTrack(videoTrack);
          setIsCamOff(false);
        }
      } catch (err) {
        toast.error('Failed to access camera');
      }
      return;
    }

    const producer = videoProducerRef.current;
    if (producer.paused) {
      await producer.resume();
      setIsCamOff(false);
    } else {
      await producer.pause();
      setIsCamOff(true);
    }
  };

  /**
   * Toggle Screen Sharing
   */
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screenshare
      const screenProducerId = screenProducerRef.current?.id;
      screenProducerRef.current?.close();
      screenProducerRef.current = null;
      
      localScreenStream?.getTracks().forEach((track) => track.stop());
      setLocalScreenStream(null);
      setIsScreenSharing(false);
      
      if (mediasoupSocket && screenProducerId) {
        mediasoupSocket.emit('producer:close', { producerId: screenProducerId });
      }
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      setLocalScreenStream(screenStream);
      
      const track = screenStream.getVideoTracks()[0];
      if (sendTransportRef.current && track) {
        const screenProducer = await sendTransportRef.current.produce({
          track,
          appData: { mediaType: 'screen' },
        });
        screenProducerRef.current = screenProducer;

        track.onended = () => {
          // Handle screenshare stopped via browser UI
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      }
    } catch (err) {
      toast.error('Screen sharing canceled or failed');
    }
  };

  return (
    <MediasoupContext.Provider
      value={{
        localStream,
        localScreenStream,
        remoteParticipants,
        isMicMuted,
        isCamOff,
        isScreenSharing,
        isInCall,
        isConnecting,
        error,
        joinCall,
        leaveCall,
        toggleMic,
        toggleCam,
        toggleScreenShare,
      }}
    >
      {children}
    </MediasoupContext.Provider>
  );
};
