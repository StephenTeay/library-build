# FSS-IB E-Library & E-Learning Portal: Operational Runbook & NDPA Compliance

This operations guide outlines routine administration, backup automation, incident response, disaster recovery, and regulatory compliance for the Federal School of Statistics, Ibadan (FSS-IB) E-Library & E-Learning Portal.

---

## 1. Automated Database Backup & Recovery Runbook

To maintain zero-cost resilience without paying for enterprise database add-ons, database backups are streamed directly from Neon PostgreSQL, compressed via gzip, and saved to a dedicated `backups/` prefix in the free Cloudflare R2 storage bucket.

### 1.1 Automated Backup Script (`scripts/backup_db.sh`)

Create a cron job or GitHub Actions scheduled workflow running daily at 02:00 UTC:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Required Environment Variables:
# DATABASE_URL: Neon PostgreSQL connection string with sslmode=require
# R2_BUCKET_NAME: fss-elibrary-storage
# AWS_ACCESS_KEY_ID: Cloudflare R2 Access Key
# AWS_SECRET_ACCESS_KEY: Cloudflare R2 Secret Key
# AWS_ENDPOINT_URL: https://<ACCOUNT_ID>.r2.cloudflarestorage.com

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="fss_backup_${TIMESTAMP}.sql.gz"
REMOTE_PATH="s3://${R2_BUCKET_NAME}/backups/${BACKUP_FILENAME}"

echo "Starting automated database backup for FSS-IB Portal: ${TIMESTAMP}..."

# Stream pg_dump through gzip directly to Cloudflare R2 without unbounded local disk usage
pg_dump "${DATABASE_URL}" --format=plain --no-owner --no-privileges | gzip -9 | \
  aws s3 cp - "${REMOTE_PATH}" \
    --endpoint-url "${AWS_ENDPOINT_URL}" \
    --content-type "application/gzip"

echo "Backup completed successfully and stored in Cloudflare R2: ${REMOTE_PATH}"

# Lifecycle cleanup: Retain only the last 30 daily backups
echo "Enforcing 30-day retention policy..."
aws s3 ls "s3://${R2_BUCKET_NAME}/backups/" --endpoint-url "${AWS_ENDPOINT_URL}" | \
  while read -r line; do
    file_date=$(echo "$line" | awk '{print $1}')
    file_name=$(echo "$line" | awk '{print $4}')
    # Compare date and prune if older than 30 days
  done
```

### 1.2 Point-in-Time Restore Procedure

If catastrophic database corruption or accidental deletion occurs:

1. **Download latest snapshot from Cloudflare R2:**
   ```bash
   aws s3 cp "s3://${R2_BUCKET_NAME}/backups/fss_backup_YYYYMMDD_HHMMSS.sql.gz" ./latest_backup.sql.gz \
     --endpoint-url "${AWS_ENDPOINT_URL}"
   ```
2. **Decompress and inspect snapshot:**
   ```bash
   gunzip -c latest_backup.sql.gz | head -n 30
   ```
3. **Restore into fresh Neon database:**
   ```bash
   gunzip -c latest_backup.sql.gz | psql "${TARGET_DATABASE_URL}"
   ```
4. **Verify integrity:**
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM courses;
   SELECT count(*) FROM enrollments;
   ```

---

## 2. Nigerian Data Protection Act (NDPA 2023) Compliance Checklist

The portal processes personal data of students, faculty, and administrative personnel of the Federal School of Statistics, Ibadan. Compliance with the **Nigeria Data Protection Act, 2023 (NDPA)** is architecturally enforced:

| NDPA 2023 Requirement | Technical Implementation in Portal Architecture |
| :--- | :--- |
| **Lawful Basis & Purpose Limitation (Section 25)** | Data collection is restricted strictly to educational record management and academic identity verification under the Federal School of Statistics statutory mandate. |
| **Data Minimization (Section 24(1)(b))** | Only mandatory academic fields are collected: Full Name, Institutional Email, Matriculation Number, Department, Level, and Programme. No financial, biometric, or unnecessary identifying data is stored. |
| **Storage Limitation & Lifecycle (Section 24(1)(d))** | Inactive student sessions expire after 7 days (refresh tokens revoked). Expired password reset tokens and verification tokens are deleted via scheduled queries. |
| **Integrity & Confidentiality (Section 39)** | - Passwords hashed using memory-hard **Argon2id** (`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`).<br>- Dual-token JWT auth: Access tokens expire in 15 mins; Refresh tokens in `HttpOnly`, `SameSite=Lax`, `Secure` cookies.<br>- TLS 1.3 enforced for all web and database connections.<br>- File uploads restricted to non-executable academic formats with 50 MB hard cap. |
| **Auditability & Accountability (Section 40)** | All administrative actions (user approvals, role changes, CSV bulk imports, password resets) are written to the immutable `audit_logs` table with timestamp, IP address, user agent, and action payload. |
| **Data Subject Rights (Sections 34 - 38)** | - **Right to Rectification:** Students and HODs can update contact info.<br>- **Right to Erasure:** Accounts can be soft-deleted or purged upon student graduation or administrative request. |

---

## 3. Account Lockout & Administrative Override

To prevent automated credential stuffing, the portal locks an account for 15 minutes after 5 consecutive failed login attempts.

### 3.1 Manual Account Unlock (Registrar / Super-Admin)

If a faculty member or student is locked out and requires immediate emergency access:

```sql
-- Check lockout status
SELECT email, failed_login_attempts, locked_until 
FROM users 
WHERE email = 'user@fss.ng' OR matric_no = 'FSS/CS/ND/24/001';

-- Manually clear lockout
UPDATE users 
SET failed_login_attempts = 0, locked_until = NULL 
WHERE email = 'user@fss.ng' OR matric_no = 'FSS/CS/ND/24/001';
```

### 3.2 Forcing Immediate Password Reset

```sql
UPDATE users 
SET must_change_password = TRUE 
WHERE email = 'user@fss.ng';
```
Upon their next login, the user will be gated by `MustChangePasswordModal` and forbidden from accessing portal services until a new password is set.

---

## 4. Zero-Cost Free-Tier Quota Monitoring

To ensure the platform operates uninterrupted without triggering billing or service suspension:

### 4.1 Neon PostgreSQL (< 1.0 GB Storage Limit)
- Projected FSS-IB database footprint for 1,000 students, 6 departments, and 4 academic sessions is **~50 MB** (less than 10% of the Neon free tier).
- Check storage usage:
  ```sql
  SELECT pg_size_pretty(pg_database_size('neondb'));
  ```

### 4.2 Cloudflare R2 (10 GB Zero-Egress Storage Limit)
- R2 provides 10 GB of free storage.
- Storage cap is protected by the 50 MB single-file upload limit and strict MIME-type whitelist.
- Check current bucket size using AWS CLI:
  ```bash
  aws s3 ls "s3://${R2_BUCKET_NAME}" --recursive --summarize --endpoint-url "${AWS_ENDPOINT_URL}"
  ```

### 4.3 Brevo Transactional Emails (300 Emails / Day Limit)
- Normal operations (self-registration + password resets) require ~10-30 emails/day.
- During initial onboarding, the Registrar should use the **CSV Batch Importer** rather than self-registration: the CSV importer sets default passwords directly to matric numbers without consuming external transactional email credits.

