# AGENTS.md — Operating Baseline for `neighborhood-gas-map`

This is the canonical operating rulebook for all AI collaborators working in `C:\Dev\neighborhood-gas-map`:
- **Antigravity (Lead Orchestrator & IDE Copilot):** Desktop command center on the ASUS ROG Strix SCAR 18 workstation. Handles architecture, UI design, map integration, and rapid testing.
- **Claude Code (Terminal Builder):** Terminal companion for quick refactoring, scripts, and PR assistance.
- **Codex (Peer Reviewer & Auditor):** Reviews edge function logic, schema validation, and security boundaries.

---

## 1. Operating Rules (Non-Negotiable)

1. **Git Workflow:**
   - `main` is production (deployed to Cloudflare Pages / `gas.galindo.co`).
   - Feature additions or substantial refactors occur on `feature/<name>` branches.
   - Dave is the sole release authority for merging to `main`.
2. **The Shared Whiteboard:**
   - Living status: [`docs/STATUS.md`](file:///c:/Dev/neighborhood-gas-map/docs/STATUS.md) tracks the active milestone, immediate next steps, and recent progress.
   - Settled decisions: [`docs/decisions/settled.md`](file:///c:/Dev/neighborhood-gas-map/docs/decisions/settled.md) documents agreed architecture, data schemas, and design invariants.
   - Open questions: [`docs/decisions/stillopen.md`](file:///c:/Dev/neighborhood-gas-map/docs/decisions/stillopen.md) captures unresolved items.
3. **Secrets Management (Zero Plaintext Secrets):**
   - Live credentials live in **Bitwarden Secrets Manager (`bws`)**, project `Home Dev` (id `1a70638d-ccf0-4c0f-a073-b4bb003b539d`).
   - Never write an API token, service key, or password into a file (`.env`, config, or code).
   - Never ask Dave to paste a secret into chat.
4. **Output Formatting:**
   - Never use LaTeX math notation (e.g. `\rightarrow`, `$\to$`) for UI steps or arrows. Always use plain Unicode arrows (`→`) or standard ASCII (`->`).
5. **No Google Maps API Billing Risk:**
   - Use Leaflet.js with free OpenStreetMap and Esri World Imagery tiles. No billing accounts, credit cards, or API quotas to worry about for neighborhood visitors.

---

## 2. Product Objectives

1. **Crowdsourced Neighborhood Gas Sighting Map:**
   - Allow neighbors in the Golden Aspen Dr / Rosewood Trail / Pond area (Flower Mound, TX) to drop pins where they detected natural gas odors.
   - Color-code pins by time of day (Morning 🌅, Afternoon ☀️, Evening 🌆, Night 🌙) and scale by odor intensity.
2. **Zero Barrier to Entry:**
   - Mobile-first, fast load times.
   - No account creation, login, or app install required.
3. **Actionable HOA & Atmos Energy Dossier:**
   - Provide a clean export/summary (CSV, printable table, coordinates list) that Dave can hand directly to HOA board members and Atmos Energy field technicians.

---

## 3. Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Mapping:** Leaflet + React-Leaflet (with OpenStreetMap & Esri Satellite aerial imagery)
- **Styling:** Modern Vanilla CSS / Tailwind with responsive bottom-sheets and glassmorphism
- **Edge Backend:** Cloudflare Pages Functions (`functions/api/reports.ts`)
- **Storage:** Cloudflare KV (`GAS_REPORTS_KV`) with resilient fallback
- **Hosting:** Cloudflare Pages (`gas.galindo.co` or `*.pages.dev`)
