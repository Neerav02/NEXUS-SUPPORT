import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { performance } from 'perf_hooks';
import { SessionService, SessionError } from '../services/session.service';
import { AuthService } from '../services/auth.service';
import { authMiddleware, isAgentPayload, isCustomerPayload } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';
import { uploadFile } from '../services/storage.service';
import { fileUploadRateLimit } from '../middleware/rateLimit.middleware';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { recordingProcessingHistogram } from '../lib/metrics';
import { startRecording, stopRecording } from '../services/recording.service';

// Configure fluent-ffmpeg paths using env
ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
const ffprobePath = env.FFMPEG_PATH.replace('ffmpeg', 'ffprobe');
if (fs.existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
} else {
  // If not on Linux, try to search in path
  const winFfprobePath = env.FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe');
  if (fs.existsSync(winFfprobePath)) {
    ffmpeg.setFfprobePath(winFfprobePath);
  }
}

// ── Multer Config ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = env.ALLOWED_FILE_TYPES.split(',');
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024, // 250MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/webm', 'video/mp4', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.webm') || file.originalname.endsWith('.mp4')) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed for call recordings`));
    }
  },
});

export const sessionsRouter = Router();

// ── Validation Schemas ──
const createSessionSchema = z.object({
  title: z.string().min(1, 'Session title is required').max(200),
});

const joinSessionSchema = z.object({
  inviteToken: z.string().min(1, 'Invite token is required'),
  displayName: z.string().min(1, 'Display name is required').max(50),
});

const listSessionsSchema = z.object({
  status: z.enum(['waiting', 'active', 'ended']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ── POST /api/sessions — Create a new session (Agent) ──
sessionsRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user || !isAgentPayload(req.user)) {
      res.status(403).json({ success: false, error: 'Agent role required' });
      return;
    }

    const body = createSessionSchema.parse(req.body);
    const session = await SessionService.create(req.user.userId, body.title);

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.errors[0]?.message });
      return;
    }
    logger.error({ err }, 'Create session error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/sessions — List agent's sessions ──
sessionsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user || !isAgentPayload(req.user)) {
      res.status(403).json({ success: false, error: 'Agent role required' });
      return;
    }

    const query = listSessionsSchema.parse(req.query);
    const result = await SessionService.listForAgent(req.user.userId, query);

    res.json({
      success: true,
      data: result.sessions,
      pagination: result.pagination,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.errors[0]?.message });
      return;
    }
    logger.error({ err }, 'List sessions error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/sessions/:id — Get session details ──
sessionsRouter.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const session = await SessionService.getById(req.params.id as string);

    // Verify caller has access
    if (req.user && isAgentPayload(req.user)) {
      if (session.agentId !== req.user.userId && req.user.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }
    }

    res.json({ success: true, data: session });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error({ err }, 'Get session error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/sessions/:id/recording — get recording status
sessionsRouter.get('/:id/recording', authMiddleware, async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id as string },
      include: { recording: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const recording = session.recording || null;
    res.json({
      recordingStatus: session.recordingStatus,
      recording: recording
        ? {
          id: recording.id,
          status: recording.status,
          fileUrl: recording.fileUrl,
          fileSizeBytes: recording.fileSizeBytes,
          processedAt: recording.processedAt,
        }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recording status' });
  }
});

// GET /api/sessions/:id/recording/download — redirect to signed URL
sessionsRouter.get('/:id/recording/download', authMiddleware, async (req, res) => {
  try {
    const recording = await prisma.recording.findFirst({
      where: { sessionId: req.params.id as string, status: 'ready' },
      orderBy: { createdAt: 'desc' },
    });
    if (!recording?.fileUrl) return res.status(404).json({ error: 'Recording not ready' });

    // If using R2/S3 signed URLs, generate one here.
    // For now, redirect to the stored file URL directly.
    res.redirect(recording.fileUrl);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch download URL' });
  }
});

// ── PATCH /api/sessions/:id/end — End a session ──
sessionsRouter.patch('/:id/end', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user || !isAgentPayload(req.user)) {
      res.status(403).json({ success: false, error: 'Agent role required' });
      return;
    }

    const session = await SessionService.endSession(
      req.params.id as string,
      req.user.userId,
      'agent'
    );

    res.json({ success: true, data: session });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error({ err }, 'End session error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── POST /api/sessions/join — Customer joins via invite token (PUBLIC) ──
sessionsRouter.post('/join', async (req: Request, res: Response) => {
  try {
    const body = joinSessionSchema.parse(req.body);
    const session = await SessionService.joinByToken(body.inviteToken);

    // Generate a short-lived customer JWT
    const token = AuthService.generateCustomerToken(session.id, body.displayName);

    res.json({
      success: true,
      data: {
        token,
        session: {
          id: session.id,
          title: session.title,
          status: session.status,
          agent: session.agent,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.errors[0]?.message });
      return;
    }
    if (err instanceof SessionError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error({ err }, 'Join session error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/sessions/:id/history — Session event log ──
sessionsRouter.get('/:id/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const events = await SessionService.getHistory(req.params.id as string);
    res.json({ success: true, data: events });
  } catch (err) {
    logger.error({ err }, 'Get history error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/sessions/:id/chat — Session chat messages ──
sessionsRouter.get('/:id/chat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const messages = await SessionService.getChatMessages(req.params.id as string);
    res.json({ success: true, data: messages });
  } catch (err) {
    logger.error({ err }, 'Get chat error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── POST /api/sessions/:id/files — Upload a file ──
sessionsRouter.post(
  '/:id/files',
  authMiddleware,
  fileUploadRateLimit,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      // Magic-byte file validation
      const hex = req.file.buffer.toString('hex', 0, 4).toUpperCase();
      let isValidMagicBytes = true;
      const mime = req.file.mimetype;

      if (mime === 'image/jpeg' && !hex.startsWith('FFD8FF')) {
        isValidMagicBytes = false;
      } else if (mime === 'image/png' && hex !== '89504E47') {
        isValidMagicBytes = false;
      } else if (mime === 'image/gif' && !hex.startsWith('474946')) {
        isValidMagicBytes = false;
      } else if (mime === 'application/pdf' && hex !== '25504446') {
        isValidMagicBytes = false;
      } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && hex !== '504B0304') {
        isValidMagicBytes = false;
      } else if (mime === 'application/msword' && hex !== 'D0CF11E0') {
        isValidMagicBytes = false;
      }

      if (!isValidMagicBytes) {
        res.status(400).json({ success: false, error: 'File content does not match its MIME type' });
        return;
      }

      // Determine sender identity and role
      let senderIdentity: string;
      let senderRole: 'agent' | 'customer';

      if (req.user && isAgentPayload(req.user)) {
        senderIdentity = req.user.userId;
        senderRole = 'agent';
      } else if (req.user && isCustomerPayload(req.user)) {
        senderIdentity = req.user.identity;
        senderRole = 'customer';
      } else {
        res.status(403).json({ success: false, error: 'Invalid token' });
        return;
      }

      // Upload using storage service
      const storageResult = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // Save as a chat message with type 'file'
      const message = await prisma.chatMessage.create({
        data: {
          sessionId: req.params.id as string,
          senderIdentity,
          senderRole,
          messageType: 'file',
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fileUrl: `/api/files/download/${storageResult.key}`,
        },
      });

      // Log file_shared event
      await prisma.sessionEvent.create({
        data: {
          sessionId: req.params.id as string,
          eventType: 'file_shared',
          actorIdentity: senderIdentity,
          actorRole: senderRole,
          metadata: {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
          },
        },
      });

      // Broadcast file message to socket room
      const io = req.app.get('io');
      if (io) {
        io.of('/chat').to(req.params.id as string).emit('chat:message', message);
      }

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (err: any) {
      if (err.message?.includes('File type')) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      logger.error({ err }, 'File upload error');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ── Background FFmpeg Transcoding Worker ──
async function processRecording(
  inputBuffer: Buffer,
  sessionId: string,
  recordingId: string
) {
  const startTime = performance.now();
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `rec-in-${sessionId}.webm`);
  const outputPath = path.join(tempDir, `rec-out-${sessionId}.mp4`);

  try {
    // Write buffer to temp input WebM file
    await fs.promises.writeFile(inputPath, inputBuffer);

    logger.info({ sessionId }, 'Starting background FFmpeg transcoding WebM to MP4...');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions('-pix_fmt yuv420p') // standard player compatibility
        .on('end', () => {
          logger.info({ sessionId }, 'FFmpeg transcoding finished successfully');
          resolve();
        })
        .on('error', (err) => {
          logger.error({ err, sessionId }, 'FFmpeg transcoding failed');
          reject(err);
        })
        .run();
    });

    // Read transcoded file back as buffer
    const outputBuffer = await fs.promises.readFile(outputPath);
    const outputSize = outputBuffer.length;

    // Upload using unified storage service
    const storageResult = await uploadFile(
      outputBuffer,
      `recording-${sessionId}.mp4`,
      'video/mp4'
    );

    // Get duration of the video via ffprobe
    let durationSeconds = 0;
    try {
      durationSeconds = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(outputPath, (err, metadata) => {
          if (err) return reject(err);
          resolve(Math.round(metadata.format.duration || 0));
        });
      });
    } catch (ffprobeErr) {
      logger.error({ ffprobeErr }, 'Failed to read video duration using ffprobe');
    }

    // Update database records
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'ready',
        fileUrl: storageResult.url,
        fileSizeBytes: outputSize,
        processedAt: new Date(),
      },
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        recordingStatus: 'ready',
      },
    });

    // Record metrics
    const processDuration = (performance.now() - startTime) / 1000;
    recordingProcessingHistogram.observe(processDuration);

    logger.info({ sessionId, duration: processDuration }, 'Recording processed successfully');
  } catch (err: any) {
    logger.error({ err, sessionId }, 'Error during background recording processing');

    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: 'failed' },
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: { recordingStatus: 'failed' },
    });
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
      if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
    } catch (cleanupErr) {
      logger.error({ cleanupErr }, 'Failed to delete temp recording files');
    }
  }
}

// ── POST /api/sessions/:id/recording/upload — Upload call recording ──
sessionsRouter.post(
  '/:id/recording/upload',
  authMiddleware,
  recordingUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No recording file provided' });
        return;
      }

      const sessionId = req.params.id as string;

      // Verify session exists and the caller is the assigned agent or admin
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      if (!req.user || !isAgentPayload(req.user)) {
        res.status(403).json({ success: false, error: 'Agent role required to upload recordings' });
        return;
      }

      if (session.agentId !== req.user.userId && req.user.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Access denied: Not the assigned agent' });
        return;
      }

      // Upsert Recording model record
      const recording = await prisma.recording.upsert({
        where: { sessionId },
        create: {
          sessionId,
          status: 'processing',
        },
        update: {
          status: 'processing',
          fileUrl: null,
          fileSizeBytes: null,
          processedAt: null,
        },
      });

      // Update session status
      await prisma.session.update({
        where: { id: sessionId },
        data: { recordingStatus: 'processing' },
      });

      // Spawn background worker to transcode the file asynchronously
      processRecording(req.file.buffer, sessionId, recording.id).catch((err) => {
        logger.error({ err, sessionId }, 'Failed to start background recording processing');
      });

      res.status(202).json({
        success: true,
        message: 'Recording upload accepted. Transcoding started in the background.',
      });
    } catch (err) {
      logger.error({ err }, 'Recording upload route error');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);
