-- Down migration for 002
-- Note: PostgreSQL does not support removing values from an existing enum type without recreating it.
-- This file exists to satisfy rollback script sequencing.
SELECT 1;
