#Requires -Version 5.1
<#
.SYNOPSIS
  SSH into the staging VPS and run ops/deploy/deploy-staging.sh

.EXAMPLE
  .\ops\deploy\deploy-staging.ps1
  .\ops\deploy\deploy-staging.ps1 -Ref main -ForceDirty
#>
param(
  [string]$HostName = "188.166.155.199",
  [string]$User = "root",
  [string]$IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519_cirlo",
  [string]$Ref = "main",
  [switch]$SkipPull,
  [switch]$SkipMigrate,
  [switch]$ForceDirty,
  [switch]$DryRun,
  [switch]$SmokeOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $IdentityFile)) {
  throw "SSH key not found: $IdentityFile"
}

$sshArgs = @(
  "-i", $IdentityFile,
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "${User}@${HostName}"
)

if ($SmokeOnly) {
  $remote = "bash /var/www/cyrlo-ride-api/app/ops/deploy/smoke-staging.sh"
  Write-Host ">> ssh ... $remote"
  & ssh @sshArgs $remote
  exit $LASTEXITCODE
}

$flags = @("--ref", $Ref)
if ($SkipPull) { $flags += "--skip-pull" }
if ($SkipMigrate) { $flags += "--skip-migrate" }
if ($ForceDirty) { $flags += "--force-dirty" }
if ($DryRun) { $flags += "--dry-run" }

$flagStr = ($flags -join " ")
# Keep LF endings — Windows CRLF here-strings break `set -o pipefail` over SSH.
$remote = @(
  'set -euo pipefail',
  'APP=/var/www/cyrlo-ride-api/app',
  'git config --global --add safe.directory "$APP" || true',
  'if [[ ! -f "$APP/ops/deploy/deploy-staging.sh" ]]; then',
  '  echo "deploy-staging.sh missing on server — pull/push ops/deploy first" >&2',
  '  exit 1',
  'fi',
  'sed -i "s/\r$//" "$APP/ops/deploy/deploy-staging.sh" "$APP/ops/deploy/smoke-staging.sh" 2>/dev/null || true',
  'chmod +x "$APP/ops/deploy/deploy-staging.sh" "$APP/ops/deploy/smoke-staging.sh"',
  "bash `"`$APP/ops/deploy/deploy-staging.sh`" $flagStr"
) -join "`n"

Write-Host ">> Deploying ref=$Ref to ${User}@${HostName}"
& ssh @sshArgs $remote
exit $LASTEXITCODE
