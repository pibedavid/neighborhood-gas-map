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
2. **Color Palette for Time of Day:**
   - 🌅 **Morning (6 AM - 12 PM):** Amber / Gold (`#f59e0b`)
   - ☀️ **Afternoon (12 PM - 6 PM):** Bright Orange (`#ea580c`)
   - 🌆 **Evening (6 PM - 10 PM):** Rose / Sunset Coral (`#e11d48`)
   - 🌙 **Night (10 PM - 6 AM):** Royal Purple / Indigo (`#7c3aed`)
3. **Visual Markers:**
   - Distinct pin badge showing time-of-day icon and intensity ring.
   - Strong reports have a gentle pulsing halo to immediately draw eyes to high-concern areas.
4. **Actionable Deliverables:**
   - Built-in "Export HOA & Atmos Energy Dossier" button: generates clean printable summary and CSV download with GPS coordinates, timestamps, and notes.
