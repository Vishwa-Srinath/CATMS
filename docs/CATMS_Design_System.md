# CATMS — Design System & UI/UX Specification

**Clinic Appointment and Treatment Management System · Visual Identity, Color, Theming & Interaction Design**

This document defines the *design layer* of CATMS — not the tech stack, not the schema, just how the system should look, feel, and respond across its five role-based portals (Reception, Clinician, Branch Manager, Admin/Finance, QA). Every choice below is justified by what it does for a clinic user, not by trend.

---

## 1. Design Direction

CATMS is used by people who are either **stressed and time-pressured** (reception, mid-booking, patient waiting) or **making decisions with financial/clinical consequences** (a doctor completing a treatment, a claim being approved). The design has to feel **calm, precise, and trustworthy** — closer to a well-run instrument panel than a consumer app. It should never feel playful, never feel like a generic admin-panel template, and never rely on color alone to communicate anything important, since a misread status in a clinic has real consequences.

Two things this system deliberately avoids:
- The generic "SaaS dashboard" look — pure white background, a single blue accent, rounded pill buttons everywhere, no personality.
- Decorative motion. Every animation in this spec earns its place by making a rule, a state change, or a risk more visible — not by looking impressive.

**Direction in one line:** *a clinical instrument, not a consumer app* — cool paper tones, one deep trust-color as the spine of the whole product, and jewel-toned identity colors that quietly tell you which portal you're in without you ever having to check.

---

## 2. Color System

### 2.1 Core palette — the six named colors everything else is built from

| Name | Hex | Role |
|---|---|---|
| **Paper** | `#F5F7F7` | App background — cool, not warm; near-white but never stark |
| **Ink** | `#12232B` | Primary text — deep charcoal-navy, softer than pure black |
| **Clinical Teal** | `#0E5E5E` | Primary brand color — used for the logo mark, primary buttons, and the Branch Manager portal |
| **Overlap Violet** | `#6C4AB6` | Signature color (see §6) and the Clinician portal identity |
| **Ledger Sienna** | `#B5651D` | Admin/Finance portal identity — a burnt orange-brown, deliberately *not* the same amber used for money-warnings (see §2.3) |
| **Harbor Blue** | `#3B6EA5` | Reception portal identity |

A seventh, quieter color — **Slate `#5B6B74`** — is reserved for the QA/Testing portal, deliberately desaturated so it reads as a "behind the scenes" utility role rather than a fifth clinical identity.

### 2.2 The golden rule: identity color vs. state color never mix

This is the single most important rule in the system, and the one most design systems get wrong in a multi-role app:

> **Role/portal colors live only in chrome** (navigation, avatars, the login-portal picker, sidebar accents). **State colors live only on data** (status pills, badges, alerts, chart series). They never appear in the same visual role, so a user is never left wondering "is this amber because I'm in Finance, or because something needs my attention?"

### 2.3 State language — one shared vocabulary for every status in the system

Appointments, invoices, and insurance claims all cycle through conceptually similar states (waiting → resolved, or waiting → partially resolved → blocked). Rather than inventing a new color meaning per entity, CATMS uses **one five-color state language everywhere**:

| State meaning | Color | Hex | Paired icon (never color alone) | Used for |
|---|---|---|---|---|
| **Waiting / in progress** | Sky | `#1E77B8` | Clock | Scheduled appointments · Pending claims |
| **Resolved / good** | Leaf | `#1E8A5F` | Check | Completed appointments · Paid invoices · Approved claims |
| **Partial / needs a look** | Gold | `#C0872A` | Half-filled circle | Partially paid invoices · Partially approved claims |
| **Blocked / needs action** | Coral | `#C4425A` | Alert triangle | Unpaid invoices · Rejected claims · Validation errors · Rejected bookings |
| **Inactive / neutral** | Slate | `#8A97A0` | Dash | Cancelled appointments · Deactivated staff |

Because this is one shared language, a reception staff member who's only ever seen it on appointments instantly understands what "Gold" means the first time they see it on an invoice. That consistency *is* the usability win — it's not decoration, it's a shortcut the user only has to learn once.

**Icon pairing is mandatory, not optional** — colorblind users (~8% of men) must never depend on color alone to read a status. Every pill shows its icon at every size, including in dense tables.

### 2.4 Data visualization palette

For the five management reports (charts, not the tables underneath them), use a six-swatch categorical palette drawn from the core + state colors so charts feel native to the product rather than bolted on from a charting library's defaults:

`Clinical Teal` `Overlap Violet` `Harbor Blue` `Ledger Sienna` `Leaf` `Sky`

Reserve **Coral** exclusively for "this number is a problem" (e.g. the outstanding-balances report's total-overdue figure) — never use it as a neutral chart category, or its urgency gets diluted.

### 2.5 Light theme (default, all portals)

| Token | Hex | Notes |
|---|---|---|
| Background | `#F5F7F7` | Paper |
| Surface (cards, modals) | `#FFFFFF` | |
| Surface-alt (table stripes, subtle panels) | `#EFF3F3` | |
| Border / hairline | `#DCE4E4` | |
| Text primary | `#12232B` | Ink |
| Text secondary | `#4B5D66` | |
| Text faint (placeholders, captions) | `#7C8B92` | |

Light theme is print-friendly by design (see §10) — every invoice and report is meant to be legible if printed on plain paper, which a cream or dark background would fight against.

### 2.6 Dark theme — offered *only* on the Clinician portal, and here's why

Most of CATMS should **not** get a dark mode. Reception desks sit under bright overhead lighting; a dark UI there would just fight the room's glare and reduce legibility for no benefit. But clinicians frequently review charts in dim exam rooms, or catch up on notes after hours — a genuine, situational reason to offer it, not a trend to apply everywhere.

So: **"Night Charting" mode** is a toggle available only inside the Clinician portal.

| Token | Hex |
|---|---|
| Background | `#12191C` |
| Surface | `#1B2429` |
| Border | `#2A353A` |
| Text primary | `#EAF0F0` |
| Text secondary | `#A8B7BC` |
| Overlap Violet (adjusted for dark, stays the portal's identity color) | `#9B7DDA` |

The state-language colors (§2.3) are the same five hues at raised luminance in dark mode, never reassigned — the vocabulary a clinician already knows in daylight mode has to still mean the same thing at 11pm.

---

## 3. Typography

| Role | Typeface | Why |
|---|---|---|
| **Display** (page titles, portal headers) | **Fraunces** | A humanist serif with real warmth — it keeps a data-dense clinical system from feeling cold or purely transactional. Used sparingly: titles and section headers only, never body copy. |
| **Body / UI** (everything a user reads or clicks) | **Inter** | Exceptional legibility at small sizes, which matters in dense tables of appointments and invoices. The neutral, quiet workhorse next to Fraunces' personality. |
| **Utility / data** (IDs, timestamps, prices, service codes) | **IBM Plex Mono** | Monospaced figures keep decimal points and digit columns aligned in tables of prices and dates — genuinely easier to scan a column of `Rs. 4,500.00` / `Rs. 12,000.00` when every digit lines up. |

**Type scale:** Display 32–40px · H1 26–28px · H2 20–22px · H3 16–18px · Body 15–16px · Caption/mono 12–13px. Line height 1.5–1.6 for body text — clinical users are often scanning quickly, and generous line height reduces row-misreading in tables.

---

## 4. Spacing, Radius & Elevation

- **8px base grid** for all spacing — margins, padding, and gaps are multiples of 8 (with 4px allowed for tight inline spacing like icon-to-label gaps).
- **12–14px card radius** — soft enough to feel humane (this is healthcare, not a spreadsheet), not so round it feels playful. Buttons and pills use a smaller 8px radius; avoid fully-pill-shaped buttons, which read as "consumer app."
- **Elevation is used sparingly and means one thing: "this is interactive or floating above the page."** A flat card with a hairline border is the default; a soft shadow (`0 8px 24px rgba(18,35,43,0.08)`) is reserved for modals, dropdowns, and the rejection-toast (§7) — so the *presence* of a shadow itself becomes a signal that something needs attention right now.

---

## 5. Iconography

A single stroke-based icon set (Lucide or Phosphor, 1.5px stroke, rounded caps) used throughout — never mix icon styles. Two extra rules specific to this system:

- **Every state pill carries its icon at every size** — this is the accessibility backbone of §2.3, not a nice-to-have.
- **No literal medical clip-art** (stethoscopes, red crosses, cartoon pills). The clinical feeling comes from color, type, and precision — not from iconography that reads as a stock-photo dentist website.

---

## 6. The Signature Element — the Overlap Ghost Preview

Every design system needs one moment that's actually memorable, and it should be the thing this specific system does that a generic booking app doesn't: **you can see the double-booking rule before you break it, not just after.**

When a receptionist hovers a time slot on a doctor's day calendar — before clicking anything — a **translucent "ghost" block** appears showing exactly where the new appointment would sit. If that slot is free, the ghost renders in **Overlap Violet at 35% opacity** with a soft outline. The instant the hovered range overlaps an existing appointment, the ghost **snaps to Coral** and a small inline label appears on the ghost itself: *"Dr. Perera is booked 10:00–10:30."*

Nothing has been submitted. No API call has even fired yet. The database's core guarantee — REQ-14, the rule this entire project's ACID story is built around — becomes something a user *feels* under their cursor, in real time, before they ever hit "Book." This is the one place in the whole product where the boldness budget (per the design principle of spending it in exactly one place) gets spent — everything else in the system stays quiet and disciplined around it.

This single interaction is also the best thirty seconds of any demo: hover, see it turn red, explain that the trigger you wrote is what the color is reacting to.

---

## 7. Supporting Micro-interactions (each one earns its place)

| Effect | Where | Why it's helpful, not decorative |
|---|---|---|
| **Live pulse dot** | Free slots on the doctor calendar | A subtle 2-second breathing animation signals "this is live data," not a stale cached view — matters when two receptionists could be looking at the same doctor at once. |
| **Field-level rejection flash** | Any form that fails a business rule | The offending field's border flashes Coral and gains a left accent bar — the eye goes straight to the problem instead of hunting through a generic banner at the top of the page. |
| **Status-pill morph** | Any status change (appointment, invoice, claim) | The pill's color and icon cross-fade in place (~180ms) rather than jump-cutting — reinforces that the system just performed a real state transition, not a page refresh. |
| **Claim stepper fill** | Insurance claim tracker | A thin progress line animates along the stepper track when a claim advances a stage — turns an anxious "where's my claim" moment into something that visibly moves forward. |
| **"Why is this disabled" tooltip** | Any greyed-out action (e.g. Record Treatment before a visit is Completed) | Names the exact rule blocking the action on hover/focus — turns a dead end into an explanation. |
| **Skeleton loading** | Reports, dashboards, any data-heavy screen | Shimmer placeholders shaped like the incoming content (not a generic spinner) — improves perceived speed and shows the user *what* is loading. |
| **Sticky table headers + first column** | Long appointment/patient/invoice tables | Reception scans dozens of rows a day; losing the header or the patient-name column on scroll is a real daily friction point, not a cosmetic one. |
| **Branded focus ring** | Every interactive element | A visible, high-contrast focus ring in the current portal's identity color, replacing (not removing) the browser default — accessible *and* on-brand. |

All motion above respects `prefers-reduced-motion` — every animated effect degrades to an instant state change with no transition when that's set, with zero loss of information.

---

## 8. Per-Portal Theming

Each of the five portals shares the same layout system, type scale, and state language — only the **identity accent** changes, applied consistently to: the portal's login tile, the sidebar's active-item highlight, the top-bar underline, and primary-action buttons.

| Portal | Identity color | What their landing screen leads with |
|---|---|---|
| **Reception** | Harbor Blue | Today's appointments across the branch, book/walk-in front and center |
| **Clinician** | Overlap Violet | Today's patient list, one tap into the current appointment's treatment form |
| **Branch Manager** | Clinical Teal | The branch's daily appointment summary — the manager's own report, not a generic dashboard |
| **Admin/Finance** | Ledger Sienna | Outstanding balances and the day's payment activity |
| **QA / Testing** | Slate | A flat, undecorated list of every screen and role available to switch into — deliberately the least "designed" portal, since it's a testing harness, not a product surface |

A user always knows which portal they're in without reading a label, purely from the accent color threading through the chrome — and because that color never appears on data (§2.2), it never competes with the actual status information on screen.

---

## 9. Empty, Error & Loading States

Failure and emptiness are treated as **moments of direction**, not apologies:

- **Empty states** are an invitation to act: "No appointments booked for today yet" with the Book button right there — never a bare "No data."
- **Errors speak in the system's voice, plainly**: "This doctor already has an appointment from 10:00–10:30" — never "An error occurred" or a raw database error string.
- **The same rejection message shown in the UI is the literal rule the trigger enforced** — this is a deliberate choice (see the SRS's §3.1 requirement that database rejection messages reach the user unmodified) and it doubles as free documentation during a demo: every blocked action *teaches* the rule it's enforcing.

---

## 10. Accessibility & Cross-Cutting Design Requirements

- **Contrast:** every text/background pairing in both themes meets WCAG AA (4.5:1 for body text, 3:1 for large text/icons).
- **Never color-alone:** every status, alert, and chart series pairs a color with an icon, label, or pattern (§2.3, §2.4).
- **Keyboard navigation:** full tab order through every form and table action; the branded focus ring (§7) is always visible, never suppressed.
- **Responsive floor:** every portal usable down to a **768px tablet width** — reception and clinician stations frequently run on tablets, not just desktops.
- **Print stylesheet:** invoices and the five reports get a dedicated print view — chrome and navigation stripped, state-language icons retained (since color may not survive a black-and-white printer), Ink-on-white only.
- **Reduced motion:** every effect in §7 has a static fallback, respected automatically via `prefers-reduced-motion`.

---

## 11. Quick Reference — Do / Don't

**Do**
- Keep role colors in chrome, state colors on data, always.
- Pair every color with an icon or label.
- Spend animation only where it clarifies a rule or a state change.
- Default to light theme everywhere; offer dark only where there's a real situational reason (Clinician, dim rooms).

**Don't**
- Don't invent a new status color per entity — appointments, invoices, and claims share the five-color state language.
- Don't use Coral for anything that isn't genuinely blocked or wrong — its urgency is the whole point.
- Don't add motion "because it looks polished" — if an effect can't name the rule or state it's clarifying, cut it.
- Don't let the Clinician's dark mode leak into any other portal.
