# Architectural Deviations Log

This document records any departure or refinement from the initial Stage 1 technical specification during the development phases, along with rationale.

| Date | Milestone | Deviation / Refinement | Justification |
|---|---|---|---|
| 2026-11-10 | Pre-Build | Downloaded portable Node.js LTS into user profile (`%LOCALAPPDATA%\Programs\nodejs`) | Standard Windows installer required elevated administrator UAC permissions unavailable in headless automation shells. Portable binaries execute identically without modifying system protected registry keys. |
| 2026-11-10 | Milestone 1 | Used `localstack/localstack` for S3 stand-in rather than MinIO | MinIO public Docker Hub images require authentication or custom registries (`quay.io/v2` 401 response). LocalStack is standard AWS S3 mock and runs cleanly on port 4566. |
| 2026-11-10 | Milestone 5 | Switched local S3 mock container to `adobe/s3mock:latest` on port 9090 | `localstack/localstack:latest` in late 2026 mandates a commercial license key (`LOCALSTACK_AUTH_TOKEN`). Adobe S3Mock is open-source, fast, and does not require credentials or licensing. |
