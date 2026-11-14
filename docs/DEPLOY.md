# FSS-IB E-Library & E-Learning Portal: Deployment Guide

This guide details the complete deployment process for the Federal School of Statistics, Ibadan (FSS-IB) E-Library & E-Learning Portal. The architecture strictly adheres to a **perpetual \$0.00 cloud operational cost**, utilizing verified free-tier platforms without custom domain requirements or credit card billing obligations.

---

## Architecture Overview & Perpetual Free-Tier Matrix

| Layer | Service Provider | Perpetual Free Tier Allowance | Purpose & Routing |
| :--- | :--- | :--- | :--- |
| **Frontend PWA & Edge Proxy** | Cloudflare Pages | Unlimited static requests, 100k Functions req/day | Hosts React PWA; reverse proxies `/api/*` via Pages Functions to eliminate CORS |
| **Backend API Service** | Render.com Web Service | 750 free instance hours/month (< 512 MB RAM) | Runs Express API, Argon2id auth, S3 presigning, streaming CSV engine |
| **Relational Database** | Neon PostgreSQL | 0.5 GiB storage, serverless autosuspend | Primary DB for users, courses, admissions, library items, discussions |
| **Object Storage** | Cloudflare R2 | 10 GB storage, 1M Class A ops, 10M Class B ops/mo | Zero-egress S3-compatible storage for lecture notes, slides, datasets |
| **Transactional Email** | Brevo (formerly Sendinblue) | 300 emails/day | Account verification, password recovery, approval notifications |
| **Keep-Alive Heartbeat** | cron-job.org | Free unlimited HTTP pings | Optional: 14-min health ping to prevent Render cold-start latency |

---

## Step 1: Database Provisioning (Neon PostgreSQL)

1. **Sign Up:** Create a free account at [neon.tech](https://neon.tech).
2. **Create Project:**
   - **Project Name:** `fss-elibrary-db`
   - **Postgres Version:** 16
   - **Region:** Frankfurt (EU Central) or closest available region.
3. **Retrieve Connection String:**
   - From your project dashboard, copy the pooled connection string:
     ```
     postgresql://<username>:<password>@<endpoint-id>.eu-central-1.aws.neon.tech/neondb?sslmode=require
     ```
4. **Execute Database Migrations:**
   In your local deployment environment, point the migrator to Neon:
   ```bash
   DATABASE_URL="postgresql://<username>:<password>@<endpoint-id>.eu-central-1.aws.neon.tech/neondb?sslmode=require" npm run db:migrate --workspace=@fss/api
   ```
5. **Seed Departmental Structure & Catalog:**
   ```bash
   DATABASE_URL="postgresql://<username>:<password>@<endpoint-id>.eu-central-1.aws.neon.tech/neondb?sslmode=require" npm run db:seed --workspace=@fss/api
   ```
6. **Bootstrap Super-Admin Registrar:**
   ```bash
   DATABASE_URL="postgresql://<username>:<password>@<endpoint-id>.eu-central-1.aws.neon.tech/neondb?sslmode=require" REGISTRAR_EMAIL="registrar@fss.ng" REGISTRAR_PASSWORD="<YourSecureInitialPassword>" npm run db:bootstrap --workspace=@fss/api
   ```

---

## Step 2: Object Storage Setup (Cloudflare R2)

1. **Access R2:** Sign in to the Cloudflare dashboard and navigate to **R2**.
2. **Create Bucket:**
   - **Bucket Name:** `fss-elibrary-storage`
   - **Location:** Automatic / EU
3. **Configure Bucket CORS:**
   Under **Bucket Settings > CORS Policy**, set the following rules to allow direct browser uploads via presigned URLs:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://*.pages.dev",
         "http://localhost:5173"
       ],
       "AllowedMethods": [
         "GET",
         "PUT",
         "HEAD"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "ExposeHeaders": [
         "ETag",
         "Content-Length",
         "Content-Type"
       ],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **Generate S3 API Tokens:**
   - Navigate to **Manage R2 API Tokens**.
   - Create a token with **Object Read & Write** permissions scoped to `fss-elibrary-storage`.
   - Record:
     - `R2_ACCESS_KEY_ID`
     - `R2_SECRET_ACCESS_KEY`
     - `R2_ENDPOINT`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

---

## Step 3: Transactional Email Setup (Brevo)

1. Sign up at [brevo.com](https://www.brevo.com).
2. Navigate to **SMTP & API > API Keys**.
3. Generate an API Key (e.g. `xkeysib-...`).
4. Set Sender Name to `FSS-IB Portal` and Sender Email to your verified institutional address (e.g. `portal@fss.ng` or administrative Gmail).

---

## Step 4: Backend API Deployment (Render.com)

1. **Create Web Service:**
   - Sign up or log in at [render.com](https://render.com).
   - Click **New > Web Service** and connect the GitHub repository.
2. **Configure Service Settings:**
   - **Name:** `fss-elibrary-api`
   - **Region:** Frankfurt (EU Central)
   - **Branch:** `main`
   - **Root Directory:** Leave empty (monorepo root)
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build --workspace=@fss/api`
   - **Start Command:** `node apps/api/dist/index.js`
   - **Instance Type:** `Free` (0.1 CPU, 512 MB RAM)
3. **Environment Variables:**
   Add the following variables in the Render dashboard:

   | Key | Value / Example | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enforces production optimizations |
   | `PORT` | `10000` | Render standard port |
   | `DATABASE_URL` | `postgresql://...sslmode=require` | Neon Postgres pooled connection string |
   | `JWT_ACCESS_SECRET` | `openssl rand -hex 32` | 256-bit cryptographic secret for 15-min access tokens |
   | `JWT_REFRESH_SECRET` | `openssl rand -hex 32` | 256-bit cryptographic secret for 7-day refresh tokens |
   | `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | Cloudflare R2 S3 endpoint |
   | `R2_BUCKET_NAME` | `fss-elibrary-storage` | S3 bucket name |
   | `R2_ACCESS_KEY_ID` | `<Key_Id>` | Cloudflare R2 token key |
   | `R2_SECRET_ACCESS_KEY` | `<Secret_Key>` | Cloudflare R2 secret key |
   | `R2_S3_FORCE_PATH_STYLE`| `false` | Required for Cloudflare R2 virtual-hosted routing |
   | `BREVO_API_KEY` | `xkeysib-...` | Brevo API key for emails |
   | `EMAIL_SENDER_NAME` | `FSS-IB Portal` | Email sender name |
   | `EMAIL_SENDER_ADDRESS` | `portal@fss.ng` | Email sender address |
   | `CORS_ORIGIN` | `https://fss-elibrary.pages.dev` | Frontend Cloudflare Pages domain |

4. **Deploy Service:**
   Render will deploy the API and assign a public URL: `https://fss-elibrary-api.onrender.com`.

---

## Step 5: Frontend PWA Deployment (Cloudflare Pages)

1. **Connect Repository:**
   - In Cloudflare Dashboard, go to **Workers & Pages > Create application > Pages > Connect to Git**.
   - Select your repository.
2. **Build Configuration:**
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm install && npm run build --workspace=@fss/web`
   - **Build Output Directory:** `apps/web/dist`
   - **Root Directory:** `/` (Monorepo root)
3. **Environment Variables:**
   - `BACKEND_URL`: `https://fss-elibrary-api.onrender.com` (Used by Pages Functions streaming proxy)
   - `NODE_VERSION`: `20.18.0`
4. **Pages Functions Proxy:**
   Cloudflare Pages automatically detects `functions/api/[[path]].ts` in your repository. It acts as an edge streaming proxy:
   ```
   https://fss-elibrary.pages.dev/api/*  --->  https://fss-elibrary-api.onrender.com/api/*
   ```
   This ensures:
   - Zero CORS issues (first-party `/api/*` cookie exchange).
   - `HttpOnly`, `SameSite=Lax` cookies work securely under `*.pages.dev`.

---

## Step 6: Post-Deployment Verification Checklist

- [ ] **Health Endpoint:** Visit `https://fss-elibrary-api.onrender.com/health` and verify `{"status":"ok"}`.
- [ ] **PWA Manifest:** Open `https://fss-elibrary.pages.dev` in Chrome DevTools > Application > Manifest. Confirm PWA installability.
- [ ] **Service Worker:** Confirm `sw.js` precaching is active in Chrome DevTools > Application > Service Workers.
- [ ] **Super-Admin Login:** Sign in with `registrar@fss.ng` and verify immediate access to Dashboard, Approval Queue, and CSV Importer.
- [ ] **Student Self-Registration:** Register a test student; confirm verification email is received from Brevo and admissions matching flag is computed.
- [ ] **Direct S3 Upload:** Log in as lecturer, upload a PDF course slide, and verify that the file reaches `fss-elibrary-storage` without proxying binary data through Render.
- [ ] **Data-Saver Mode:** Click the top navbar "Data-Saver" toggle; verify video embeds and large media are suppressed.

