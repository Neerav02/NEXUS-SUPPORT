import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import * as mediasoup from 'mediasoup';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../lib/prisma';
import { uploadFile } from './storage.service';
import { getRouter, getProducers } from '../config/mediasoup';

interface RecordingSession {
  sessionId: string;
  audioTransport: mediasoup.types.PlainTransport | null;
  videoTransport: mediasoup.types.PlainTransport | null;
  audioConsumer: mediasoup.types.Consumer | null;
  videoConsumer: mediasoup.types.Consumer | null;
  ffmpegProcess: ffmpeg.FfmpegCommand | null;
  audioPort: number;
  videoPort: number;
  outputPath: string;
  recordingId: string;
}

const activeRecordings = new Map<string, RecordingSession>();
const RECORDINGS_TMP_DIR = '/tmp/nexus-recordings';

if (!fs.existsSync(RECORDINGS_TMP_DIR)) {
  fs.mkdirSync(RECORDINGS_TMP_DIR, { recursive: true });
}

function getAvailablePort(base: number): number {
  // Simple sequential port allocator — good enough for hackathon
  // Ports 50000-59999 reserved for recording PlainTransports
  return base + Math.floor(Math.random() * 9999);
}

export async function startRecording(sessionId: string): Promise<{ recordingId: string }> {
  if (activeRecordings.has(sessionId)) {
    throw new Error('Recording already active for this session');
  }

  const router = getRouter(sessionId);
  if (!router) throw new Error('No router found for session');

  const recordingId = uuidv4();
  const outputPath = path.join(RECORDINGS_TMP_DIR, `${recordingId}.mp4`);

  const audioPort = getAvailablePort(50000);
  const videoPort = getAvailablePort(55000);

  // Create PlainTransports for RTP forwarding to FFmpeg
  const audioTransport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1', announcedIp: undefined },
    rtcpMux: false,
    comedia: false,
  });

  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1', announcedIp: undefined },
    rtcpMux: false,
    comedia: false,
  });

  await audioTransport.connect({ ip: '127.0.0.1', port: audioPort, rtcpPort: audioPort + 1 });
  await videoTransport.connect({ ip: '127.0.0.1', port: videoPort, rtcpPort: videoPort + 1 });

  // Find the first agent's producers in the session
  // We consume ALL producers in the session for recording
  const producers = getProducers(sessionId);

  let audioConsumer: mediasoup.types.Consumer | null = null;
  let videoConsumer: mediasoup.types.Consumer | null = null;

  for (const producer of producers) {
    if (producer.kind === 'audio' && !audioConsumer) {
      audioConsumer = await audioTransport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });
    }
    if (producer.kind === 'video' && !videoConsumer) {
      videoConsumer = await videoTransport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });
    }
    if (audioConsumer && videoConsumer) break;
  }

  const recording: RecordingSession = {
    sessionId,
    audioTransport,
    videoTransport,
    audioConsumer,
    videoConsumer,
    ffmpegProcess: null,
    audioPort,
    videoPort,
    outputPath,
    recordingId,
  };

  // Start FFmpeg
  const sdpAudio = buildAudioSdp(audioPort, audioConsumer);
  const sdpVideo = buildVideoSdp(videoPort, videoConsumer);

  const audioSdpPath = path.join(RECORDINGS_TMP_DIR, `${recordingId}-audio.sdp`);
  const videoSdpPath = path.join(RECORDINGS_TMP_DIR, `${recordingId}-video.sdp`);
  fs.writeFileSync(audioSdpPath, sdpAudio);
  fs.writeFileSync(videoSdpPath, sdpVideo);

  const proc = ffmpeg()
    .input(audioSdpPath)
    .inputOptions(['-protocol_whitelist', 'file,crypto,udp,rtp', '-f', 'sdp'])
    .input(videoSdpPath)
    .inputOptions(['-protocol_whitelist', 'file,crypto,udp,rtp', '-f', 'sdp'])
    .outputOptions([
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '0:a:0',
      '-map', '1:v:0',
      '-f', 'mp4',
      '-movflags', '+faststart',
    ])
    .output(outputPath)
    .on('start', (cmd) => console.log('[Recording] FFmpeg started:', cmd))
    .on('error', (err) => console.error('[Recording] FFmpeg error:', err.message));

  proc.run();
  recording.ffmpegProcess = proc;
  activeRecordings.set(sessionId, recording);

  // Create DB record
  await prisma.recording.create({
    data: {
      id: recordingId,
      sessionId,
      status: 'recording',
    },
  });

  await prisma.session.update({
    where: { id: sessionId },
    data: { recordingStatus: 'recording' },
  });

  return { recordingId };
}

export async function stopRecording(sessionId: string): Promise<void> {
  const recording = activeRecordings.get(sessionId);
  if (!recording) throw new Error('No active recording for this session');

  // Kill FFmpeg gracefully
  if (recording.ffmpegProcess) {
    (recording.ffmpegProcess as any).ffmpegProc?.stdin?.write('q');
    setTimeout(() => {
      try { (recording.ffmpegProcess as any).ffmpegProc?.kill('SIGKILL'); } catch { }
    }, 3000);
  }

  // Close mediasoup resources
  recording.audioConsumer?.close();
  recording.videoConsumer?.close();
  recording.audioTransport?.close();
  recording.videoTransport?.close();

  activeRecordings.delete(sessionId);

  await prisma.recording.update({
    where: { id: recording.recordingId },
    data: { status: 'processing' },
  });

  await prisma.session.update({
    where: { id: sessionId },
    data: { recordingStatus: 'processing' },
  });

  // Post-process async — upload to storage
  processAndUploadRecording(recording);
}

async function processAndUploadRecording(recording: RecordingSession) {
  const { outputPath, recordingId, sessionId } = recording;

  // Wait 3s for FFmpeg to flush
  await new Promise((r) => setTimeout(r, 3000));

  try {
    if (!fs.existsSync(outputPath)) {
      throw new Error('Recording output file not found');
    }

    const fileBuffer = fs.readFileSync(outputPath);
    const fileKey = `recordings/${sessionId}/${recordingId}.mp4`;
    const { url: fileUrl } = await uploadFile(fileBuffer, fileKey, 'video/mp4');
    const stats = fs.statSync(outputPath);

    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'ready',
        fileUrl,
        fileSizeBytes: stats.size,
        processedAt: new Date(),
      },
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: { recordingStatus: 'ready' },
    });

    // Cleanup temp files
    fs.unlinkSync(outputPath);
    const audioSdp = path.join(RECORDINGS_TMP_DIR, `${recordingId}-audio.sdp`);
    const videoSdp = path.join(RECORDINGS_TMP_DIR, `${recordingId}-video.sdp`);
    if (fs.existsSync(audioSdp)) fs.unlinkSync(audioSdp);
    if (fs.existsSync(videoSdp)) fs.unlinkSync(videoSdp);

    console.log(`[Recording] ${recordingId} ready at ${fileUrl}`);
  } catch (err) {
    console.error('[Recording] Post-processing failed:', err);
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: 'failed' },
    });
    await prisma.session.update({
      where: { id: sessionId },
      data: { recordingStatus: 'none' },
    });
  }
}

function buildAudioSdp(port: number, consumer: mediasoup.types.Consumer | null): string {
  if (!consumer) return '';
  const params = consumer.rtpParameters;
  const codec = params.codecs[0];
  const payloadType = codec.payloadType;
  return `v=0
o=- 0 0 IN IP4 127.0.0.1
s=FFmpeg Audio
c=IN IP4 127.0.0.1
t=0 0
m=audio ${port} RTP/AVP ${payloadType}
a=rtpmap:${payloadType} OPUS/48000/2
a=fmtp:${payloadType} minptime=10;useinbandfec=1
a=recvonly
`;
}

function buildVideoSdp(port: number, consumer: mediasoup.types.Consumer | null): string {
  if (!consumer) return '';
  const params = consumer.rtpParameters;
  const codec = params.codecs[0];
  const payloadType = codec.payloadType;
  const codecName = codec.mimeType.split('/')[1].toUpperCase();
  return `v=0
o=- 0 0 IN IP4 127.0.0.1
s=FFmpeg Video
c=IN IP4 127.0.0.1
t=0 0
m=video ${port} RTP/AVP ${payloadType}
a=rtpmap:${payloadType} ${codecName}/90000
a=recvonly
`;
}

export async function recordProducer(sessionId: string, producer: mediasoup.types.Producer): Promise<void> {
  const recording = activeRecordings.get(sessionId);
  if (!recording) return;

  const router = getRouter(sessionId);
  if (!router) return;

  if (producer.kind === 'audio' && !recording.audioConsumer && recording.audioTransport) {
    recording.audioConsumer = await recording.audioTransport.consume({
      producerId: producer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });
  }
  if (producer.kind === 'video' && !recording.videoConsumer && recording.videoTransport) {
    recording.videoConsumer = await recording.videoTransport.consume({
      producerId: producer.id,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });
  }
}