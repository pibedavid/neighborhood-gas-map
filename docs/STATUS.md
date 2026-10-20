# STATUS.md — Living State of Neighborhood Gas Map
**Last Updated:** October 20, 2026  
**Current Phase:** Phase 2 — Peer Review Resolution & Production Hardening

---

## What Just Happened
- Ingested comprehensive peer reviews from Claude Code ([`docs/CC_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/CC_feedback.md)) and Codex ([`docs/codex_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/codex_feedback.md)).
- Settled 4 architectural decisions with Dave:
  1. Storage: Option A — Cloudflare D1 (Serverless SQLite) table `reports` with KV fallback.
  2. Pin Placement: Option A — Explicit Placement Mode ("Tap map where you smelled it" + "📍 Use My GPS" button, never defaulting to Dave's house coordinate).
  3. Ownership & Moderation: Option A — Zero-friction `editToken` (UUID stored in localStorage, verified via SHA-256 hash on server for `PUT`/`DELETE`, soft-delete `is_deleted = 1`).
  4. Spam & Bot Protection: Option B — Smart bot detection (Turnstile invisible / managed) without hard device GPS geofencing, allowing neighbors to report while at work.
- Hardened security and fixed reported vulnerabilities:
  - **Stored XSS (P0-2):** Eliminated `innerHTML` in marker popups; popups constructed using safe DOM nodes and `textContent`.
  - **Ownership Bypass (P0-3):** Implemented server-side token validation; restricted delete in "View All" modal to user's own reports only.
  - **CSV Formula Injection & Truncation (P1-7):** Used `\uFEFF` UTF-8 BOM + `Blob` object URL, escaping leading formula triggers (`=`, `+`, `-`, `@`).
  - **Date Bug (P1-3):** Fixed UTC rollover bug where evening sightings after 7:00 PM CDT were logged as tomorrow; now uses `getLocalTodayDate()`.
  - **Map Click vs Popup Dismissal (P1-6):** Guard added to prevent map click from opening new report modal when dismissing a popup.
  - **Marker Drag Fix (P1-5):** Prevented layer rebuild during drag so marker doesn't get destroyed mid-drag.
- Wiped all fake mock seed pins so Dave can inaugurate the real dataset.
- Verified build: `npm run build` succeeds cleanly with 0 TypeScript/Vite errors.

---

## Active Phase: 2nd Pass Peer Review Ready
- **GitHub Repository:** [`https://github.com/pibedavid/neighborhood-gas-map`](https://github.com/pibedavid/neighborhood-gas-map) (branch `main`).
- **Live Cloudflare Pages URL:** [`https://neighborhood-gas-map.pages.dev`](https://neighborhood-gas-map.pages.dev).
- **D1 Database Status:** Fully bound (`DB`), table initialized, and verified live via real read/write/delete round-trip probe.
- **Ready for Review:** Claude Code and Codex can now run their 2nd pass review against commit `1e4a8ac` or latest `main`.


