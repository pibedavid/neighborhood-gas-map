# STATUS.md — Living State of Neighborhood Gas Map
**Last Updated:** October 20, 2026  
**Current Phase:** Phase 4 — Reviewers Converged & Soft Launch Approved

---

## 4th Pass Peer Review Summary

Both Claude Code ([`docs/CC_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/CC_feedback.md)) and Codex ([`docs/codex_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/codex_feedback.md)) completed their 4th review pass against latest `main`.

### Reviewer Verdicts
- **Claude Code:** *"Ready for a soft launch to the neighborhood Facebook group. The 3rd-pass regression is fixed correctly, and every low-priority backend item I raised is done and verified live. No new bugs this round... Go for the soft launch."*
- **Codex:** *"The third-pass form-recovery, strict-date, error-privacy, payload-size, privacy-disclosure, and mobile zoom fixes are verified. The server-side data and authorization boundaries are in good shape for a controlled pilot."*

---

## Hardening & Convergence Milestones

1. **Error Recovery & Form Persistence:**
   - Handlers in `src/App.tsx` re-throw API errors so `ReportModal` displays its inline alert while preserving all filled fields.
   - Move-pin flow retains state on network failure for immediate retry.

2. **Strict Calendar Validation & Date Safety:**
   - Impossible dates (e.g. `2026-02-31`) rejected via strict ISO round-trip matching.
   - 90-day window check only evaluates when the date is modified, preventing lockout on older edits.

3. **Data Boundary & Sanitization:**
   - Flower Mound geographic geofence (33.01–33.06 lat, -97.08 to -97.02 lng) strictly enforced on POST & PUT.
   - GPS client check constrained to ~1.0 mile around neighborhood center.
   - Spreadsheet formula injection protected even with leading whitespace.
   - 16KB content-length ceiling returning `413 Payload too large`.

4. **Privacy & Access:**
   - Stored XSS eliminated (DOM textContent marker popups).
   - Edit tokens (UUID hashed with SHA-256 in D1) restrict edits/deletes to the authoring device.
   - Server-side errors logged to `console.error`; generic messages to clients.
   - `noindex, nofollow` meta tags and `X-Robots-Tag: noindex` protect neighborhood data from public search engines.
   - Viewport meta permits mobile pinch-to-zoom (WCAG).

---

## Operational Runbook: D1 Database Management

If spam or bogus test records ever need to be moderated, Dave can execute these queries directly in the **Cloudflare Dashboard → Storage & Databases → D1 → `neighborhood-gas-db` → Console**:

```sql
-- 1. Inspect recent active reports
SELECT id, created_at, observed_date, observed_time, time_of_day, intensity, reported_by, notes
FROM reports
WHERE is_deleted = 0
ORDER BY created_at DESC
LIMIT 50;

-- 2. Soft-delete a specific bogus report by ID
UPDATE reports
SET is_deleted = 1, updated_at = datetime('now')
WHERE id = 'REPORT_UUID_HERE';

-- 3. Soft-delete all reports created after a specific timestamp (reversible)
UPDATE reports
SET is_deleted = 1, updated_at = datetime('now')
WHERE created_at > '2026-10-21T00:00:00Z';

-- 4. Restore soft-deleted reports if needed
UPDATE reports
SET is_deleted = 0
WHERE id = 'REPORT_UUID_HERE';
```

---

## Active Environment State
- **Live URL:** [`https://neighborhood-gas-map.pages.dev`](https://neighborhood-gas-map.pages.dev)
- **Repository:** `main` branch on GitHub (`pibedavid/neighborhood-gas-map`)
- **Database:** Cloudflare D1 `neighborhood-gas-db` (bound as `DB`)
- **Status:** Officially approved for neighborhood launch. Ready for Dave's inaugural pin!
