# Federal School of Statistics, Ibadan (FSS-IB)
## Zero-Cost E-Learning Portal & Digital Library

An autonomous, mobile-first, zero-cost e-learning portal and digital library reference implementation for the **Federal School of Statistics, Ibadan (FSS-IB)**.

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
Operates 100% within perpetual cloud free-tiers without requiring custom domains or credit card commitments:
- **Frontend PWA:** Vite + React 18 on Cloudflare Pages (`*.pages.dev`) with Service Worker offline caching.
- **Same-Origin Proxy:** Cloudflare Pages Functions (`/api/*`) streaming requests directly to the backend.
- **Backend API:** Node.js Express on Render Web Service (< 512 MB RAM footprint).
- **Database:** Serverless Postgres on Neon (< 50 MB actual storage vs 1.0 GB limit) with connection pooling.
- **File Storage:** Private Cloudflare R2 bucket with presigned PUT/GET access URLs.
- **Email:** Brevo transactional free tier (300 emails/day, single verified sender).
- **Keep-Alive:** cron-job.org health ping every 10 minutes between 07:00 and 22:00 WAT.

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

#### 2. Start Local Databases (PostgreSQL + MinIO S3 Stand-in)
```bash
docker compose up -d
```
- PostgreSQL available on `localhost:5433` (DB: `fss_elibrary`, User: `postgres`, Password: `postgres`).
- MinIO Object Storage on `localhost:9000` (Console: `localhost:9001`, User: `minioadmin`, Password: `minioadmin`).

#### 3. Run Migrations & Seed Sample Data
```bash
npm run db:migrate
npm run db:seed
npm run db:bootstrap
```

#### 4. Run Development Stack
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

---

### Documentation Map
- **Stage 1 Design Specification:** [docs/DESIGN.md](docs/DESIGN.md)
- **Build Plan & Checkpoint Checklist:** [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- **Build Log:** [docs/BUILD_LOG.md](docs/BUILD_LOG.md)
- **Architectural Deviations:** [docs/DEVIATIONS.md](docs/DEVIATIONS.md)
- **Production Deployment Guide:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Operations & NDPA Compliance:** [docs/OPERATIONS.md](docs/OPERATIONS.md)

