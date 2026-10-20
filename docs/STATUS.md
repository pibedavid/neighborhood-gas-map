# STATUS.md — Living State of Neighborhood Gas Map
**Last Updated:** October 20, 2026  
**Current Phase:** Phase 3 — Hardening Refinements & 3rd Pass Review

---

## What Just Happened
- Ingested 2nd pass peer reviews from Claude Code ([`docs/CC_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/CC_feedback.md)) and Codex ([`docs/codex_feedback.md`](file:///c:/Dev/neighborhood-gas-map/docs/codex_feedback.md)).
- Implemented core hardening refinements:
  - **Shared Strict Validator (POST & PUT):** Unified schema validation across create and update. Enforces finite coordinates within Flower Mound neighborhood boundary (approx ±0.025° around Golden Aspen & Pond), valid enums (`timeOfDay`, `intensity`, `smellType`, `windCondition`), calendar date (`YYYY-MM-DD` within 90 days), and text length caps.
  - **Clarified Geofence Model:**
    - Device Geofence = NO: Neighbors can report while at work or away from home.
    - Pin Geofence = YES: Dropped pin coordinates are confined to the neighborhood area (rejecting worldwide junk).
    - Client Proximity Check: If a neighbor taps "Use My GPS" while away from the neighborhood (> 2.5 miles), the app alerts them to tap the map location where the smell occurred instead of pinning their remote GPS fix.
  - **Removed Legacy KV Fallback:** Stripped out dead single-key KV code. Server fails closed (`503 Service Unavailable`) if D1 `DB` binding is missing.
  - **Fail-Closed Token Verification:** Rows without an edit token hash now require admin key authorization.
  - **Client Error Toasts:** Wrapped delete, move, and undo operations in `try / catch` with clear user alerts on network failure or permission denial.
  - **Configuration in Git:** Added [`wrangler.toml`](file:///c:/Dev/neighborhood-gas-map/wrangler.toml) with D1 binding.
  - **Mobile dvh:** Added dynamic viewport height (`100dvh`) support to prevent layout jump under mobile address bars.
  - **Docs Hygiene:** Cleaned up duplicate section headers in [`docs/decisions/settled.md`](file:///c:/Dev/neighborhood-gas-map/docs/decisions/settled.md) and outdated domain references in [`AGENTS.md`](file:///c:/Dev/neighborhood-gas-map/AGENTS.md).
- Verified production build clean (`npm run build` completed with 0 errors).

---

## Active Phase: 3rd Pass Peer Review Ready
- **GitHub Repository:** [`https://github.com/pibedavid/neighborhood-gas-map`](https://github.com/pibedavid/neighborhood-gas-map) (branch `main`).
- **Live Cloudflare Pages URL:** [`https://neighborhood-gas-map.pages.dev`](https://neighborhood-gas-map.pages.dev).
- **D1 Database Status:** Fully bound (`DB`) and verified live via real read/write/delete round-trip probe.
- **Ready for 3rd Pass:** Claude Code and Codex can now run their final verification pass against latest `main`.



