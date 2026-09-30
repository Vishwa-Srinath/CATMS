# docs/adr/

Architecture Decision Records — signed during Gate G0.

ADRs are the **highest authority** document in the CATMS precedence hierarchy.  
Once signed, an ADR cannot be reversed without a new ADR counter-signing it.

## Signed ADRs

| File | Issue | Title | Status |
|---|---|---|---|
| `001_phase1_scope_and_precedence.md` | CATMS-001 | Phase 1 Scope Boundary and Document Precedence Hierarchy | ✅ Signed G0 |
| `002_erd_naming_datatypes_and_delete_policies.md` | CATMS-002 | ERD Naming Conventions, Standard Datatypes, and Delete Policies | ✅ Signed G0 |
| `004_appointment_and_scheduling_semantics.md` | CATMS-004 | Appointment & Scheduling Rules, Overlap Semantics, and Time Boundaries | ✅ Signed G0 |
| `009_project_governance_and_migration_registry.md` | CATMS-009 | Project Governance, Migration Registry, and Contribution Rules | ✅ Signed G0 |

## ADR Precedence Hierarchy

```
Approved ADRs
    ↓
Production ERD  (CATMS_Production_Implementation_ERD.drawio)
    ↓
SRS             (CATMS_SRS_new.pdf)
    ↓
Member Plan     (member_plan.md)
    ↓
API Contracts   (docs/api/)
    ↓
Source Code
```

When any two documents conflict, the higher-ranked document wins.  
If you believe an ADR needs to change, raise it with Dev1 and all reviewers — do not silently implement a different approach.
