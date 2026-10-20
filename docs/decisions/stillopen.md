# Architectural Decisions Status
**Location:** `docs/decisions/stillopen.md`  
**Last Updated:** October 20, 2026  

---

## Foundational Decisions (All Settled)

1. **Subdomain Choice:**
   - **Settled:** Published on standalone Cloudflare Pages subdomain (`https://neighborhood-gas-map.pages.dev`). Kept detached from `galindo.co` to protect household privacy.

2. **Atmos Direct Hotline Callout:**
   - **Settled:** Prominent emergency alert displayed in top header banner with direct phone number (866-322-8667) and 911 warning.

3. **Data Moderation / Admin Delete:**
   - **Settled:** Implemented two-tier system:
     - End-user: Zero-friction client `editToken` (UUID stored locally, SHA-256 hashed in D1) enables editing/moving/deleting author's own pins.
     - Admin: Protected via `X-Admin-Key` header with `ADMIN_API_KEY` Cloudflare Pages secret for administrative moderation. Soft delete (`is_deleted = 1`) preserves audit record for utility/HOA.

---

## Potential Post-Launch Enhancements (Optional / Backlog)

1. **Cloudflare Turnstile Public Site Key:**
   - Server endpoint is prepared to validate Turnstile tokens if configured.
   - When ready for full public bot gating, Dave can generate a Turnstile sitekey in Cloudflare Dashboard, render the Turnstile widget in `ReportModal`, and then set `TURNSTILE_SECRET_KEY` in Pages secrets.

2. **Date Range Filter for Historical Trends:**
   - Currently, pins can be filtered by Time of Day (Morning, Afternoon, Evening, Night).
   - If reports accumulate over several weeks/months, an explicit date range filter can be added to the header.
