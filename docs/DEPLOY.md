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

## Step 3: Transactional Email Setup (Choose ONE Option)

You can choose whichever email delivery method is easiest for you:

### Option A: Gmail with App Password (Easiest & Free)
This works with any personal or institutional `@gmail.com` account and requires no DNS records or domain verification.

1. Go to your Google Account security settings: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is turned **ON**.
3. Go directly to **App Passwords**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   *(If prompted, enter your Google password)*.
4. Enter an App Name (e.g. `FSS Portal`) and click **Create**.
5. Copy the generated **16-character password** (e.g., `abcd efgh ijkl mnop`).
6. Your environment variables on Render will be:
   - `EMAIL_PROVIDER`: `gmail`
   - `GMAIL_USER`: `yourname@gmail.com`
   - `GMAIL_APP_PASSWORD`: `abcd efgh ijkl mnop` (spaces are automatically ignored)
   - `EMAIL_SENDER_NAME`: `FSS-IB E-Library`

---

### Option B: Resend (Modern Free API - 3,000 emails/month)
1. Sign up at [resend.com](https://resend.com).
2. Go to **API Keys** > **Create API Key**.
3. For testing without your own custom domain, Resend allows sending test emails from `onboarding@resend.dev` to your registered email address.
4. Your environment variables on Render will be:
   - `EMAIL_PROVIDER`: `resend`
   - `RESEND_API_KEY`: `re_...`
   - `EMAIL_FROM`: `onboarding@resend.dev` (or your verified domain address)

---

### Option C: Console Mode (Zero Setup - Direct Render Logs)
If you just want to deploy and test the platform immediately without configuring any email provider:
1. Set:
   - `EMAIL_PROVIDER`: `console`
2. Whenever a student registers, requests a password reset, or an admin creates staff, the full verification link, password reset link, and temporary password are printed directly in real time in the **Render Service Logs** (`[EMAIL-DISPATCH]`)!
3. You can copy the link straight from the Render dashboard log tab to test the flows.

---

### Option D: Brevo (Formerly Sendinblue)
1. Sign up at [brevo.com](https://www.brevo.com).
2. Navigate to **SMTP & API > API Keys** and generate a key (`xkeysib-...`).
3. Set:
   - `EMAIL_PROVIDER`: `brevo`
   - `BREVO_API_KEY`: `xkeysib-...`
   - `EMAIL_FROM`: `your_verified_sender@domain.com`

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
   | `EMAIL_PROVIDER` | `gmail` (or `console`, `resend`, `brevo`) | Email provider strategy |
   | `GMAIL_USER` | `your_email@gmail.com` | If using Gmail App Password |
   | `GMAIL_APP_PASSWORD` | `16-char-app-password` | If using Gmail App Password |
   | `EMAIL_SENDER_NAME` | `FSS-IB Portal` | Email sender name |
   | `EMAIL_SENDER_ADDRESS` | `your_email@gmail.com` | Email sender address |
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

