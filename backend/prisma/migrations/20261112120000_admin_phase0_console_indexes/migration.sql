-- Admin Phase 0: indexes for console analytics and passenger listing.
CREATE INDEX IF NOT EXISTS "users_role_status_idx" ON "users"("role", "status");
CREATE INDEX IF NOT EXISTS "payments_purpose_status_created_at_idx" ON "payments"("purpose", "status", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at");
