# Settled Architecture & Product Decisions
**Status:** Settled Baseline  
**Location:** `docs/decisions/settled.md`  
**Date:** October 20, 2026  

---

## 1. Operating Model & Collaboration
- **Single repository:** `C:\Dev\neighborhood-gas-map`
- **Branching policy:** `main` is production; isolated branches (`feature/<name>`) for work items.
- **Approval gate:** Dave approves any PR before merge to `main`.
- **Zero Plaintext Secrets:** Any deployment or API tokens managed via Bitwarden Secrets Manager (`bws`).

---

## 2. Technology Choices
1. **Frontend Core:**
   - React 19 + TypeScript + Vite.
   - Fast bundle, hot reloading, type safety.
2. **Mapping Engine:**
   - **Leaflet.js + OpenStreetMap / Esri World Imagery.**
   - Why not Google Maps? Zero cost, zero billing account requirement, no API key exposure, no credit card quota limits.
   - Dual-layer toggle: Standard street map (clear street names like Golden Aspen Dr, Rosewood Trail) and Satellite aerial imagery (allows neighbors to spot their exact rooftop, fence line, or tree near the pond).
3. **Data Storage & Backend:**
   - Cloudflare Pages Functions (`functions/api/reports.ts`).
   - Backed by Cloudflare KV (`GAS_REPORTS_KV`) in production.
   - Dual-mode client: Reads from `/api/reports`, with automatic localStorage fallback when running offline or in preview without KV bound.

---

## 3. Product Invariants & Pin Schema
1. **Pin Attributes:**
   - `id`: Unique string (UUID or timestamp-based)
   - `lat`: Latitude float
   - `lng`: Longitude float
   - `timeOfDay`: `'morning'` | `'afternoon'` | `'evening'` | `'night'`
   - `timestamp`: Date/time of observation
   - `intensity`: `'faint'` (hint) | `'moderate'` (clear smell) | `'strong'` (acrid / potent)
   - `smellType`: `'rotten-egg'` | `'sulfur'` | `'chemical'` | `'other'`
   - `windCondition`: Calm, light breeze, windy (optional)
   - `notes`: Description (e.g., "Along the walking path near the wooden bridge")
   - `reportedBy`: Name, initials, or Anonymous
   - `createdAt`: ISO timestamp
4. **Hosting & Domain:**
   - Standalone Cloudflare Pages deployment (e.g. `*.pages.dev`).
   - Will NOT be published under personal domain `galindo.co` to keep community project detached.

---

## 3. Product Invariants & Pin Schema
1. **Pin Attributes:**
   - `id`: Unique string (UUID or timestamp-based)
   - `lat`: Latitude float
   - `lng`: Longitude float
   - `timeOfDay`: `'morning'` | `'afternoon'` | `'evening'` | `'night'`
   - `observedDate`: Date of observation (YYYY-MM-DD)
   - `observedTime`: Approximate time (e.g. "08:30 AM")
   - `intensity`: `'faint'` (hint) | `'moderate'` (clear smell) | `'strong'` (acrid / potent)
   - `smellType`: `'rotten-egg'` | `'sulfur'` | `'chemical'` | `'other'`
   - `windCondition`: Calm, light breeze, windy (optional)
   - `notes`: Description (e.g., "Along the walking path near the wooden bridge")
   - `reportedBy`: Name, initials, or Anonymous
   - `createdAt`: ISO timestamp
2. **Distinct 4-Color Palette for Time of Day:**
   - 🌅 **Morning (6 AM - 12 PM):** Bright Amber/Gold (`#eab308`)
   - ☀️ **Afternoon (12 PM - 6 PM):** Crisp Sky Blue (`#0284c7`)
   - 🌆 **Evening (6 PM - 10 PM):** Crimson / Rose Red (`#e11d48`)
   - 🌙 **Night (10 PM - 6 AM):** Deep Violet / Purple (`#7c3aed`)
3. **Visual Markers:**
   - Clean 16px circular dot markers (Google Maps mobile style) with crisp white border and drop shadow. No internal icons/emojis to avoid visual clutter.
   - Strong reports have a gentle pulsing radar ring to highlight high-concern pockets.
   - Zero external landmark badges on the map to prevent cluttering the neighborhood view.
4. **Map Viewport Alignment:**
   - Centered at `[33.0352, -97.0482]` with `zoom: 16.6` (`zoomSnap: 0.1`) so west-side streets (Maple Grove, Lofty Pines, Redwood Crest) and eastern pond/bridge/Golden Aspen Dr fit cleanly on both mobile and laptop screens.
5. **Actionable Deliverables:**
   - Built-in "Export HOA & Atmos Energy Dossier" button: generates clean printable summary and CSV download with GPS coordinates, timestamps, and notes.
