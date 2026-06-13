-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('agent', 'admin');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('waiting', 'active', 'ended');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('none', 'recording', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('agent', 'customer');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'file');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('created', 'joined', 'left', 'recording_started', 'recording_stopped', 'ended', 'reconnected', 'file_shared');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'agent',
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'waiting',
    "invite_token" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "recording_status" "RecordingStatus" NOT NULL DEFAULT 'none',
    "recording_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "identity" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "total_duration_seconds" INTEGER,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "sender_identity" TEXT NOT NULL,
    "sender_role" "ParticipantRole" NOT NULL,
    "content" TEXT,
    "message_type" "MessageType" NOT NULL DEFAULT 'text',
    "file_url" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "event_type" "EventType" NOT NULL,
    "actor_identity" TEXT NOT NULL,
    "actor_role" "ParticipantRole" NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'processing',
    "file_url" TEXT,
    "file_size_bytes" INTEGER,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_invite_token_key" ON "sessions"("invite_token");

-- CreateIndex
CREATE INDEX "sessions_agent_id_idx" ON "sessions"("agent_id");

-- CreateIndex
CREATE INDEX "sessions_invite_token_idx" ON "sessions"("invite_token");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "session_participants_session_id_idx" ON "session_participants"("session_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "session_events_session_id_idx" ON "session_events"("session_id");

-- CreateIndex
CREATE INDEX "session_events_occurred_at_idx" ON "session_events"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
