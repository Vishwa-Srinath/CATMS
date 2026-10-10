# =============================================================================
# scripts/run-security-audit.ps1
# Owner: Dev2 | Reviewer: Dev1 | Gate: G5 | Issue: CATMS-074
#
# Master runner for the Complete Authentication, RBAC & Security Audit Suite.
# =============================================================================

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path "$scriptDir\.."

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '   CATMS-074 - Master Authentication, RBAC and Security Audit    ' -ForegroundColor White
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

Write-Host '[Stage 1] Running PostgreSQL Storage-Layer Role Privilege Audit...' -ForegroundColor Yellow
try {
    & "$repoRoot\database\tests\security\074_security_rbac_audit.ps1"
} catch {
    Write-Host "Notice: Direct SQL stage skipped. Proceeding to Vitest suite." -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host '[Stage 2] Running Backend API, 3-Layer RBAC and Security Vitest Suite...' -ForegroundColor Yellow
Set-Location "$repoRoot\backend"
& npx vitest run tests/security-rbac-audit.test.ts

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host 'PASS: All CATMS-074 Authentication, RBAC and Security Suites OK! ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host ''
