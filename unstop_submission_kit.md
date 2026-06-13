# Nexus Support — Submission Assets

This document provides the exact text, files, and scripts you need to submit your project on the **Unstop** competition form.

---

## 📋 Field 1: Demo Video (Script & Presentation Guide)

Since this is a video upload, you should record a **2-minute screen recording** demonstrating the main user flow. 

### ⏱️ Video Recording Script (2 Minutes)

| Time | Scene | What to Say / Show |
| :--- | :--- | :--- |
| **0:00 - 0:20** | **Public Dashboard** | *Show the main screen (`/dashboard`).* <br>"Welcome to Nexus Support. This is our public dashboard where anyone can view active and ended support calls. To safeguard session privacy, unauthenticated users see a preview view." |
| **0:20 - 0:45** | **Auth Interception** | *Click "New Session" or one of the mock sessions. Show the login redirect.* <br>"If a guest attempts to create a session or join an active support call, our application intercepts the action, triggers a toast notification, and routes them to our unified login/register page. Let's register a new agent." |
| **0:45 - 1:15** | **Registration & Room Creation** | *Fill in the registration form (Display Name, Email, Password), submit it, and let it auto-login. Then create a new support session.* <br>"Upon registration, the user profile is synchronized to Supabase Auth and our database, automatically logging the agent in. We can now create a live support session." |
| **1:15 - 1:45** | **Live WebRTC Session** | *Join the call. Copy the invite link, open an incognito browser window, paste the URL, and join as a guest.* <br>"Nexus Support runs on a custom-built mediasoup SFU (WebRTC) server. All audio and video streams route through the server with zero peer-to-peer overhead. We also support real-time chat and document sharing during the support call." |
| **1:45 - 2:00** | **Recording & End Session** | *Click "Start Recording" (optional), wait a few seconds, then end the session.* <br>"Agents can record sessions server-side. Ending the session terminates the media workers, disconnects participants, and redirects them to a session completion screen." |

---

## 🔗 Field 2: Demo URL
Enter your deployed Vercel frontend URL:
```
https://nexus-support.vercel.app
```
*(Make sure to replace this with your actual Vercel URL if you redeploy under a different project name).*

---

## 📄 Field 3: Login credentials & architectural diagram
*Save the content below as a PDF or Word document named `login_credentials_and_architecture.pdf` and upload it.*

### Document Content:
```markdown
# NEXUS SUPPORT — Login Credentials & System Architecture

### 🔑 Test Credentials
The application is pre-seeded with fallback accounts. You can also register a new account on the fly.

* **Agent Account**:
  - Email: `agent@nexus.support`
  - Password: `changeme123`
* **Admin Account**:
  - Email: `admin@nexus.support`
  - Password: `changeme123`

---

### 🏗️ System Architecture & Data Flow

```
[Agent Browser]       [Customer Browser]
       │                      │
       ├─── REST API Requests ┼───> [Express API Server] ───> [Supabase Auth]
       │                      │              │
       │                      │              ├───> [Prisma DB (Postgres)]
       │                      │              └───> [Redis Cache / PubSub]
       │                      │
       └─── WebSockets ───────┼───> [Socket.io Gateway]
       │                      │
       └─── WebRTC Media ─────┼───> [mediasoup SFU Workers] ──> [FFmpeg Recorder]
                                                                      │
                                                                      └──> [Storage]
```

#### Core Components:
1. **Frontend Client**: Built with React, Vite, Zustand, and Tailwind CSS, deployed on Vercel.
2. **Backend Gateway**: Node.js + Express API serving REST endpoints, using Socket.io for WebSockets, and database sync hooks.
3. **Database (Prisma + PostgreSQL)**: Relational schema handling persistence of sessions, participants, messages, and recordings.
4. **Cache (Redis)**: Manages concurrent socket synchronization, active room locks, and token blacklists.
5. **Media Pipeline (mediasoup WebRTC SFU)**: zentralized Selective Forwarding Unit that handles low-latency audio/video routing.
6. **FFmpeg Recording Engine**: Server-side subprocess forks that tap into active media streams and transcode them to MP4 recordings.
```

---

## 📝 Field 4: README
*Save the content below as a file named `README.md` and upload it.*

### Document Content:
```markdown
# NEXUS SUPPORT — Setup & Documentation

NEXUS SUPPORT is a real-time WebRTC support calling platform powered by a custom mediasoup Selective Forwarding Unit (SFU).

### 🛠️ Local Setup Instructions

1. **Clone & Setup Environment**
   ```bash
   git clone https://github.com/Neerav02/NEXUS-SUPPORT.git
   cd NEXUS-SUPPORT
   ```
2. Configure `apps/api/.env` and `apps/web/.env` with your Supabase URL and Anon API key.
3. **Run Services**
   ```bash
   docker compose up -d
   ```
4. **Deploy Database Schema**
   ```bash
   docker compose exec api npx prisma migrate dev
   docker compose exec api npx prisma db seed
   ```
5. **Run Frontend Client**
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

### ⚠️ Known Limitations
- Recording requires FFmpeg installed on the backend server (automatically configured inside the Docker image).
- The mediasoup workers require exposed UDP ports range `40000-40100` (configurable) on the host firewall.
- Room layout is currently optimized for a 1-to-1 agent-customer connection.
```

---

## 💻 Field 5: Link to Source code repository
Enter your GitHub repository link:
```
https://github.com/Neerav02/NEXUS-SUPPORT.git
```
