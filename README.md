# NEXUS SUPPORT

**Real-Time Video Support Platform** — AtomQuest Hackathon 1.0

> "See the Problem. Solve It Now."

## Live Demo
- Frontend: https://nexus-support.vercel.app
- Backend: https://nexus-api.railway.app

## Demo Credentials
- **Agent Login:** admin@nexus.support / changeme123
- **Customer Join:** Use any invite link generated from the agent dashboard

---

## What It Does

NEXUS SUPPORT is a real-time video support platform where **agents** create support sessions and **customers** join via invite links — no registration required. Built on **mediasoup** (open-source SFU), all media routes through the server with zero peer-to-peer connections.

### Core Features
1. **Real-Time Video Calling** — mediasoup SFU, WebRTC, simulcast support
2. **In-Call Chat** — Real-time text messaging with file sharing
3. **Session Management** — Create, track, and manage support sessions
4. **Call Recording** — Server-side FFmpeg recording, downloadable MP4
5. **Admin Dashboard** — Live session monitoring, metrics, Prometheus endpoint

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript, Vite, Zustand, TanStack Query, Framer Motion |
| Backend | Node.js 20 + TypeScript, Express, Socket.io, mediasoup v3 |
| Database | PostgreSQL 16 (Prisma ORM) |
| Cache | Redis 7 |
| Storage | Cloudflare R2 |
| Recording | FFmpeg |
| Observability | Prometheus (prom-client) |

---

## Local Setup

### Prerequisites
- **Docker Desktop** (for backend, PostgreSQL, Redis)
- **Node.js 20+** (for frontend dev server)
- **Git**

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd nexus-support

# 2. Start backend services (API + PostgreSQL + Redis)
docker-compose up -d

# 3. Run database migrations (inside Docker)
docker-compose exec api npx prisma migrate dev

# 4. Seed the database
docker-compose exec api npx prisma db seed

# 5. Install frontend dependencies
cd apps/web && npm install

# 6. Start frontend dev server
npm run dev

# 7. Open the app
# Frontend: http://localhost:5173
# Backend: http://localhost:8080/health
```

---

## Architecture

```
Browser (Agent/Customer)
    │
    ├── REST API ──────── Express.js ──── PostgreSQL
    ├── WebSocket ──────── Socket.io ──── Redis
    └── WebRTC Media ──── mediasoup SFU ── FFmpeg (Recording)
                                          └── Cloudflare R2 (Storage)
```

---

## Known Limitations
- Recording requires FFmpeg installed on the server (included in Docker image)
- UDP ports 40000-49999 must be open for mediasoup RTP traffic
- Maximum 2 participants per session in current implementation
- File uploads limited to 20MB

---

## License
Built for AtomQuest Hackathon 1.0
