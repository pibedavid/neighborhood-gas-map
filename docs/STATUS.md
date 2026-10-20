# STATUS.md — Living State of Neighborhood Gas Map
**Last Updated:** October 20, 2026  
**Current Phase:** Phase 3 — 3rd Pass Peer Review Resolution & Soft Launch Ready

---

## 3rd Pass Peer Review Summary

Both Claude Code ([`docs/CC_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/CC_feedback.md)) and Codex ([`docs/codex_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/codex_feedback.md)) completed their 3rd review pass against latest `main`.

### Key Verdict
- **Backend & Storage Hardening:** Verified strong. D1 SQLite persistence is stable, create/update endpoints share a unified strict schema validator with geographic geofencing, fail-closed token authorization protects every record, and the insecure KV fallback has been completely removed.
- **Production Build:** Passes cleanly with 0 TypeScript/Vite errors (`npm run build`).

---

## Resolutions Applied in Response to 3rd Pass Feedback

1. **Form Input Retention on API Failure (3P-2.2):**
   - Fixed the error swallowing in `handleAddReport` and `handleUpdateReport`.
   - Errors are now re-thrown so `ReportModal` catches them, displays an inline error alert banner, and keeps the neighbor's filled form inputs (notes, dates, times, selections) intact without closing the modal or losing work.
   - `handleSaveMovedPin` keeps move mode active on failure so neighbors can retry repositioning.

2. **Calendar Date Validation Tightening (3P-2.5):**
   - Added strict day-of-month check (`dateObj.toISOString().slice(0, 10) !== observedDate`) to reject rollover dates (e.g., `2026-02-31`).
   - Guarded 90-day window check so it only evaluates when `observedDate` is actually being changed, preventing legitimate owners from being locked out of editing notes or locations on older records.

3. **Neutralized Error Detail Leakage (3P-2.5):**
   - Stripped `details: msg` from 500 responses across GET, POST, PUT, and DELETE handlers.
   - Raw database errors are logged server-side via `console.error` (accessible in Pages Function logs) while the client receives clean, safe error messages.

4. **Payload Size Capped (3P-2.5):**
   - Added 16KB content-length ceiling in `parseJsonBody` before invoking `request.json()`.

5. **Tightened CSV Formula Escaping:**
   - Updated formula trigger regex to `/^\s*[=+\-@\t\r]/` to prevent formula execution in spreadsheets even when cells contain leading whitespace.

6. **Mobile Accessibility & Privacy:**
   - Removed `user-scalable=no` and `maximum-scale=1.0` in `index.html` to support pinch-to-zoom for older neighbors, complying with WCAG guidelines.
   - Added `<meta name="robots" content="noindex, nofollow" />` to keep community reports private from public search indexing.
   - Added community record privacy disclosure to `ReportModal` and softened reporter name placeholder.

7. **Tightened GPS Proximity Check:**
   - Reduced client GPS distance threshold from ~2.5 miles (0.035°) to ~1.0 mile (0.015°) around neighborhood center `[33.0352, -97.0482]` to tightly reflect the Flower Mound neighborhood boundary.

8. **Configuration & Operational Clarifications:**
   - **D1 Binding:** Configured directly in the Cloudflare Pages Dashboard (Settings → Functions → D1 database bindings: `DB` → `neighborhood-gas-db`). No `wrangler.toml` is committed without the real database UUID to avoid build breakages.
   - **Turnstile Rollout Sequence:** Server-side Turnstile verification is fail-closed *if* `TURNSTILE_SECRET_KEY` is present. To prevent 403 blocks for neighbors, the client widget must be rendered with a public Site Key before the secret key is set in Pages environment variables.

---

## Active Environment State
- **Live URL:** [`https://neighborhood-gas-map.pages.dev`](https://neighborhood-gas-map.pages.dev)
- **Repository:** `main` branch on GitHub (`pibedavid/neighborhood-gas-map`)
- **Database:** Cloudflare D1 `neighborhood-gas-db` (bound as `DB`, verified with live round-trip tests)
- **Status:** Ready for initial pilot pin and community sharing!
