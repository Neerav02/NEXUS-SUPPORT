import { z } from 'zod';

const envSchema = z.object({
  // ── Server ──
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),

  // ── Database ──
  DATABASE_URL: z.string().url(),

  // ── Redis ──
  REDIS_URL: z.string(),

  // ── JWT ──
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CUSTOMER_JWT_EXPIRES_IN: z.string().default('4h'),

  // ── mediasoup ──
  MEDIASOUP_LISTEN_IP: z.string().default('0.0.0.0'),
  MEDIASOUP_ANNOUNCED_IP: z.string().default('127.0.0.1'),
  MEDIASOUP_MIN_PORT: z.coerce.number().default(40000),
  MEDIASOUP_MAX_PORT: z.coerce.number().default(49999),
  MEDIASOUP_WORKERS: z.coerce.number().default(2),

  // ── Storage (Cloudflare R2) ──
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('nexus-support'),
  R2_PUBLIC_URL: z.string().optional(),

  // ── Reconnect Timeouts ──
  AGENT_RECONNECT_TIMEOUT_SECONDS: z.coerce.number().default(120),
  CUSTOMER_RECONNECT_TIMEOUT_SECONDS: z.coerce.number().default(30),

  // ── FFmpeg ──
  FFMPEG_PATH: z.string().default('/usr/bin/ffmpeg'),

  // ── CORS ──
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // ── File Uploads ──
  MAX_FILE_SIZE_MB: z.coerce.number().default(20),
  ALLOWED_FILE_TYPES: z.string().default(
    'image/jpeg,image/png,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ),

  // ── Metrics ──
  METRICS_SECRET: z.string().optional(),

  // ── Supabase ──
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
