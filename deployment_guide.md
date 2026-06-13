# Nexus Support — Production Deployment Playbook

This playbook outlines exactly where and how to deploy both the API backend and the React frontend of the Nexus Support platform.

---

## 🗺️ Deployment Overview

Since Railway's free trial is over, we will use **Render** or **Koyeb** to host the backend API server. Both have excellent free options.

| Component | Target Platform | Free Tier Details |
| :--- | :--- | :--- |
| **Frontend Web Client** | **Vercel** | Free static hosting with automatic builds for Vite React apps. |
| **Backend API Server** | **Render** or **Koyeb** | **Render**: Free web services (spins down after inactivity). <br>**Koyeb**: Free credits covering a micro container instance (no spin-down). |
| **Database (PostgreSQL)** | **Supabase** | Managed PostgreSQL instance with free tier. |
| **Cache & Event Bus (Redis)** | **Upstash** | Free serverless Redis (up to 10,000 commands per day). |

---

## 🔑 Phase 1: Database & Identity (Supabase Setup)

1. **Create a Supabase Project**: Go to [supabase.com](https://supabase.com) and create a free project.
2. **Retrieve Database Connection String**: In your Supabase settings (under **Database**), find the Connection String. Choose **URI** and use the port `6543` for connection pooling (append `?pgbouncer=true` if available):
   ```env
   DATABASE_URL=postgresql://postgres:<password>@db.drhibkkbcsfkhnghqeef.supabase.co:6543/postgres?pgbouncer=true
   ```
3. **Push Prisma Schema**: Execute the following command on your local machine to push the schema directly to Supabase:
   ```bash
   npx prisma db push --schema=apps/api/prisma/schema.prisma
   ```

---

## 🔑 Phase 2: Serverless Cache (Upstash Redis Setup)

Since we cannot run Redis in a container for free, we use Upstash:

1. **Create Upstash Account**: Go to [upstash.com](https://upstash.com) and create a free Redis database.
2. **Retrieve URL**: Copy the **Redis Connect URL** (e.g. `rediss://default:password@name.upstash.io:6379`).

---

## 🚀 Phase 3: Backend API Deployment Options

### Option A: Deploying on Render (Easiest Free Tier)

Render supports WebSockets and custom `Dockerfile` deployments out of the box.

1. Go to [render.com](https://render.com) and sign in.
2. Click **New** -> **Web Service**.
3. Connect your GitHub repository `Neerav02/NEXUS-SUPPORT`.
4. In the settings, configure:
   - **Environment**: `Docker`
   - **Docker Path**: `Dockerfile` *(Relative to the Root Directory)*
   - **Root Directory**: `apps/api`
   - **Instance Type**: `Free`
5. Click **Advanced** and add the following **Environment Variables**:

| Variable | Recommended Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` *(Render binds to 10000 automatically)* |
| `DATABASE_URL` | *Your Supabase PostgreSQL URI* |
| `REDIS_URL` | *Your Upstash Redis URL* |
| `JWT_SECRET` | *Your secret token string* |
| `SUPABASE_URL` | *Your Supabase project URL* |
| `SUPABASE_ANON_KEY` | *Your Supabase Anon Key* |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0` |
| `MEDIASOUP_ANNOUNCED_IP` | *Your Render Service URL (e.g. `nexus-support-api.onrender.com` without `https://`)* |

6. Click **Create Web Service**. 

*Note: Free web services on Render go to sleep after 15 minutes of inactivity. When a new request arrives, it takes about 50 seconds to spin back up.*

---

### Option B: Deploying on Koyeb (No Spin-Down Free Tier)

Koyeb offers $5.50/month in free credits, which completely covers a Micro VM instance. It runs continuously without going to sleep.

1. Go to [koyeb.com](https://koyeb.com) and sign in.
2. Click **Create Service**.
3. Select **GitHub** and choose `Neerav02/NEXUS-SUPPORT`.
4. Configure the service:
   - **Builder**: Select **Docker** (Koyeb will automatically find the Dockerfile in `apps/api`).
   - **Root Directory**: `apps/api`
   - **Instance Size**: `Eco - Micro`
5. Add the **Environment Variables** listed in the table above.
6. Under **Ports**:
   - Add port `8080` (HTTP) mapping to path `/`.
7. Click **Deploy**.

---

## 💻 Phase 4: Deploying the Frontend (Vercel)

Vercel is the ideal choice to host the frontend.

1. Go to [vercel.com](https://vercel.com) and import your `Neerav02/NEXUS-SUPPORT` repo.
2. Configure settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add the **Environment Variables**:
   - `VITE_API_URL`: Your Render/Koyeb service URL (e.g., `https://nexus-support-api.onrender.com` or `https://nexus-support.koyeb.app`).
   - `VITE_SUPABASE_URL`: Your Supabase URL.
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key.
4. Click **Deploy**.
