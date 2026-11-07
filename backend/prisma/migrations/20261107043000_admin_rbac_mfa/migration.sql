-- Milestone 2: staff grants, invitations, bootstrap lock, TOTP MFA.
-- Legacy users.role = ADMIN is NOT auto-promoted to SUPER_ADMIN.

CREATE TYPE "StaffRole" AS ENUM ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN');

ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'ADMIN_LOGIN';

CREATE TABLE "admin_role_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "staff_role" "StaffRole" NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "admin_role_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_invitations" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "staff_role" "StaffRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_bootstrap_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,

    CONSTRAINT "admin_bootstrap_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_mfa_credentials" (
    "user_id" UUID NOT NULL,
    "encrypted_totp_secret" TEXT NOT NULL,
    "enabled_at" TIMESTAMP(3),
    "last_used_step" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_mfa_credentials_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "admin_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_role_grants_user_id_revoked_at_idx" ON "admin_role_grants"("user_id", "revoked_at");
CREATE INDEX "admin_role_grants_staff_role_revoked_at_idx" ON "admin_role_grants"("staff_role", "revoked_at");
CREATE INDEX "admin_invitations_phone_number_created_at_idx" ON "admin_invitations"("phone_number", "created_at");
CREATE UNIQUE INDEX "admin_invitations_token_hash_key" ON "admin_invitations"("token_hash");
CREATE INDEX "admin_recovery_codes_user_id_used_at_idx" ON "admin_recovery_codes"("user_id", "used_at");

ALTER TABLE "admin_role_grants" ADD CONSTRAINT "admin_role_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_role_grants" ADD CONSTRAINT "admin_role_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_mfa_credentials" ADD CONSTRAINT "admin_mfa_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure singleton bootstrap row exists (incomplete until first successful bootstrap).
INSERT INTO "admin_bootstrap_state" ("id", "completed_at", "completed_by") VALUES (1, NULL, NULL);

-- CHECK: Super Admin grantor must differ from subject when granted_by is present.
ALTER TABLE "admin_role_grants"
  ADD CONSTRAINT "admin_role_grants_no_self_super_admin"
  CHECK (
    "staff_role" <> 'SUPER_ADMIN'
    OR "granted_by" IS NULL
    OR "granted_by" <> "user_id"
  );
