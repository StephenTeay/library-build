# Federal School of Statistics, Ibadan (FSS-IB)
## Zero-Cost E-Learning Portal & Digital Library

An autonomous, mobile-first, zero-cost e-learning portal and digital library reference implementation for the **Federal School of Statistics, Ibadan (FSS-IB)**.

---

### Target Audience & Departments
Designed for National Diploma (ND) and Higher National Diploma (HND) students across six academic departments:
1. **Computer Science (CS):** Syntax-highlighted code, Markdown guides, lab boilerplates.
2. **Artificial Intelligence (AI):** Colab/Kaggle notebook links, model cards, dataset references.
3. **Networking & Cloud Computing (NCC):** Topology images, Packet Tracer/GNS3 files, cloud labs.
4. **Statistics (STA):** R/Python/SPSS syntax, dataset files (.csv, .sav), NBS portal links.
5. **Accountancy (ACC):** Financial statement templates, practice sheets, IFRS references.
6. **Business Administration (BA):** Case studies, plan templates, discussion forums.

---

### Zero-Cost Architecture Overview
Operates 100% within verified perpetual cloud free-tiers without requiring custom domains or credit cards:
- **Frontend PWA:** Vite + React 18 on Cloudflare Pages (`*.pages.dev`) with Service Worker offline precaching.
- **Same-Origin Proxy:** Cloudflare Pages Functions (`/api/*`) streaming requests directly to the backend to eliminate CORS issues and protect HttpOnly cookies.
- **Backend API:** Node.js Express on Render Web Service (< 512 MB RAM footprint).
- **Database:** Serverless Postgres on Neon (< 50 MB actual storage vs 1.0 GB limit) with connection pooling.
- **File Storage:** Private Cloudflare R2 bucket with presigned PUT/GET access URLs (direct client-to-storage transfers).
- **Email:** Brevo transactional free tier (300 emails/day, single verified sender).
- **Cold-Start Resilience:** UI banner detects Render cold starts and retries requests automatically with exponential backoff.

---

### Local Development Setup

#### Prerequisites
- Node.js 20+ LTS
- Docker & Docker Compose

#### 1. Clone & Install
```bash
git clone <repo-url>
cd e-library
npm install
```

#### 2. Start Local Databases (PostgreSQL + S3Mock Stand-in)
```bash
docker compose up -d
```
- PostgreSQL available on `localhost:5433` (DB: `fss_elibrary`, User: `postgres`, Password: `postgres`).
- Adobe S3Mock Storage on `localhost:9090` (Bucket: `fss-elibrary-storage`).

#### 3. Run Migrations & Seed Sample Data
```bash
npm run db:migrate
npm run db:seed
npm run db:bootstrap
```

*Default Seeded Super-Admin Account:*
- **Email:** `registrar@fss.ng`
- **Password:** `AdminPass123!`

#### 4. Run Development Stack
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

#### 5. Run Test Suite
```bash
# Run all 42 tests across backend API and frontend PWA
npm test

# Run individual workspace tests
npm test --workspace=@fss/api
npm test --workspace=@fss/web
```

---

### Key Capabilities Built

- **Authentication & Security:** Argon2id hashing, dual-token JWT auth with short-lived access tokens and rotating refresh tokens in HttpOnly cookies, sliding-window rate limiting, 15-minute account lockout after 5 failed attempts, and forced password-change gate (`must_change_password`).
- **Student Onboarding:** Streaming CSV batch importer with atomic chunks of 100 and bounded memory; self-registration with admissions master list validation (`matched_verified`); staff approval queue scoped by department.
- **Content & Direct Object Storage:** Presigned PUT uploads to Cloudflare R2 / S3Mock with mandatory HEAD verification; presigned GET downloads scoped to course enrollment; file allowlists and 50 MB limits.
- **Physical Library & Open Aggregator:** PostgreSQL physical library catalog with call numbers, shelf locations, and live copy counts; Koha SRU stub; curated departmental hub and live arXiv & GitHub search with in-memory caching.
- **Course Discussions:** Course-specific discussion forums with threads, replies, and lecturer soft-deletion moderation.
- **Frontend PWA:** Offline caching via CacheStorage API, device storage quota gauge (`navigator.storage.estimate()`), YouTube Lite thumbnail facade (zero iframe until play), and Data-Saver mode.

---

### Documentation Map
- **Stage 1 Design Specification:** [docs/DESIGN.md](docs/DESIGN.md)
- **Build Plan & Checklist:** [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- **Build Execution Log:** [docs/BUILD_LOG.md](docs/BUILD_LOG.md)
- **Architectural Deviations:** [docs/DEVIATIONS.md](docs/DEVIATIONS.md)
- **Production Deployment Guide:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Operations & NDPA Compliance:** [docs/OPERATIONS.md](docs/OPERATIONS.md)
