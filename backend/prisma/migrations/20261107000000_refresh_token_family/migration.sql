-- Add session family tracking for refresh-token reuse detection.
-- Each existing row receives its own family id via gen_random_uuid().

ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
