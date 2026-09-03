---
name: CATMS Pull Request
about: Submit changes for review and integration
---

## CATMS Issue Reference

Closes `CATMS-XXX`

## SRS Requirements Traceability

- `REQ-XX`: [Description of requirement satisfied]
- `BR-XX`: [Business rule satisfied]

## Summary of Changes

<!-- High-level summary of what was changed, added, or fixed -->

## Affected Layers

- [ ] Database Migration (Range / File: `database/migrations/NNN_*.sql`)
- [ ] Backend API Endpoint (`backend/src/modules/*`)
- [ ] Frontend Feature / Component (`frontend/src/features/*`)
- [ ] Tests (Schema / DB / API / Integration)
- [ ] Documentation / ADR (`docs/*`)

## Verification & Test Commands

```bash
# Exact commands run to verify this pull request:
./scripts/test.sh --layer database
npm test
```

## Mandatory Verification Evidence

### 1. Success Case (Happy Path Output / Screenshot)
```text
<!-- Paste terminal test output or describe successful UI flow here -->
```

### 2. Failure Case (Business Rule Rejection / Validation Output)
```text
<!-- Paste terminal output showing exception/validation blocking correctly -->
```

## Pull Request Checklist

- [ ] Issue key (`CATMS-XXX`) and SRS requirements linked
- [ ] Conventional Commit format used (`type(scope): description`)
- [ ] Migration claimed in assigned range without modifying merged migrations
- [ ] At least one non-author developer review requested
- [ ] Cross-module changes include both affected module owners
- [ ] CI pipeline checks pass cleanly
- [ ] No secrets, real patient data, or unhandled raw SQL errors present
