# Nexus Support — Production Deployment Playbook

This playbook outlines exactly where and how to deploy both the API backend and the React frontend of the Nexus Support platform.

---

## 🗺️ Deployment Overview

To host this platform, the components should be distributed as follows:

| Component | Target Platform | Details |
| :--- | :--- | :--- |
| **Frontend Web Client** | **Vercel** | Free/Paid static hosting with automatic builds for Vite single-page apps. |
| **Backend API Server** | **Railway** | Handles persistent Node.js runtime, WebSockets, and compiles **mediasoup** native bindings. |
| **Database (PostgreSQL)** | **Supabase** (or Railway DB) | Managed PostgreSQL instance. Supabase is highly recommended since we use its Auth API. |
| **Cache & Event Bus (Redis)** | **Upstash** (or Railway Redis) | Used for socket presence synchronization and token blacklisting. |

---

## 🔑 Phase 1: Database & Identity (Supabase Setup)

Because the authentication state and registration details sync with Supabase:

1. **Create a Supabase Project**: Go to [supabase.com](https://supabase.com) and spin up a new project.
2. **Retrieve API Keys**: In your Supabase settings (under **API**), find:
   - `Project URL` (e.g., `https://drhibkkbcsfkhnghqeef.supabase.co`)
   - `Anon Public Key` (e.g., `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
3. **Database Migration**: Set the `DATABASE_URL` in your local `.env` to point to the Supabase connection string:
   ```env
   DATABASE_URL=postgresql://postgres:<password>@db.drhibkkbcsfkhnghqeef.supabase.co:6543/postgres?pgbouncer=true
   ```
4. **Push DB Schema**: Push the Prisma schema structure directly to your Supabase PostgreSQL database:
   ```bash
   npx prisma db push --schema=apps/api/prisma/schema.prisma
   ```

---

## 🚀 Phase 2: Deploying the Backend API (Railway)

We use **Railway** because it natively supports persistent WebSocket servers, Dockerfiles, and custom port configuration required by WebRTC.

### Step 1: Create a Project on Railway
1. Go to [railway.app](https://railway.app) and create a new project.
2. Choose **Deploy from GitHub repo** and select `Neerav02/NEXUS-SUPPORT`.

### Step 2: Configure Monorepo Root & Build Command
1. In the service settings, set the **Root Directory** to `apps/api`.
2. Railway will automatically detect the `Dockerfile` inside `apps/api` and use it to build a secure container.

### Step 3: Add Redis Service
1. In your Railway project, click **New** -> **Database** -> **Redis**.
2. Railway will spin up a Redis instance and automatically expose a `REDIS_URL` environment variable to your project.

### Step 4: Configure Service Environment Variables
Add these key-value pairs in the **Variables** tab of your API service on Railway:

| Name | Recommended Value / Source | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enforces production optimization. |
| `PORT` | `8080` | Internal listen port. |
| `DATABASE_URL` | *Copy your Supabase connection string* | Connection URI for PostgreSQL. |
| `REDIS_URL` | *Copy from your Railway Redis service variables* | Connection URI for Redis cache. |
| `JWT_SECRET` | *Generate a random 64-char string* | Used by backend token authentication. |
| `SUPABASE_URL` | `https://your-project-id.supabase.co` | Your Supabase Project URL. |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1...` | Your Supabase Anon Key. |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0` | Listen interface bind IP. |
| `MEDIASOUP_ANNOUNCED_IP` | *Your Railway API Public Domain* (without `https://`) | The public domain where clients send WebRTC media traffic. |

---

## 💻 Phase 3: Deploying the Frontend (Vercel)

Vercel offers the best optimization for our React frontend app.

### Step 1: Set Up Project
1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Select your `Neerav02/NEXUS-SUPPORT` repository.

### Step 2: Build & Development Settings
Under the project build settings, configure:
- **Framework Preset**: `Vite`
- **Root Directory**: `apps/web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Step 3: Configure Environment Variables
Add the following frontend-specific environment variables in Vercel:

1. `VITE_API_URL`
   * Set this to your Railway Backend API domain (e.g., `https://nexus-support-api.up.railway.app`). Do **not** append a trailing slash.
2. `VITE_SUPABASE_URL`
   * Set this to your Supabase project URL.
3. `VITE_SUPABASE_ANON_KEY`
   * Set this to your Supabase Anon Key.

### Step 4: Deploy
Click **Deploy**. Vercel will build your TypeScript bundle and deploy it globally.

---

## 🔍 Phase 4: Verification Checklist

Once both platforms show a green deployment status:

1. **Visit the Dashboard**: Navigate to your Vercel deployment URL. You should see the public dashboard displaying mock sessions.
2. **Test Auth Routing**: Click "Sign In / Register". Try creating an account. Confirm you are instantly logged in and redirected back to the dashboard with your display name in the header.
3. **Check Supabase Database**: In the Supabase project dashboard, navigate to **Table Editor** -> **User**. Verify a new row exists containing the exact email and display name you registered with.
4. **Launch a Support Call**:
   - Logged in as an agent, click **New Session** and enter a title.
   - Click the session card to enter the call room.
   - Copy the invite URL and open it in a separate browser window. Join as a guest and check if real-time audio/video and chat function correctly.
