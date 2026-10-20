# CC_feedback.md — Claude Code Review & Test Report

**Reviewer:** Claude Code (CC)
**Date:** October 20, 2026
**Commit reviewed:** `77ca6d7` (`main`)
**Scope:** Full read of every source file, docs, and config; production build; type-check of the edge function; read-only probes of the live site (`https://neighborhood-gas-map.pages.dev`). No production data was written: I made **no POST/PUT/DELETE calls against the live API**.

---

## 0. Verdict (TL;DR)

The UI is polished and the product concept fits the problem well. **Don't share the link in the Facebook group again until the P0 items are fixed.** Today the live app throws away every neighbor's pin. Once storage is fixed, any visitor can wipe, edit, or hijack the whole dataset in one request.

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| P0-1 | 🔴 Blocker | Production KV is not bound, so submissions are silently discarded | **Verified live** |
| P0-2 | 🔴 Blocker | Stored XSS: notes and name are injected raw into popup HTML | Verified in code |
| P0-3 | 🔴 Blocker | Anyone can delete or edit any pin (UI and API both) | Verified in code |
| P0-4 | 🔴 Blocker | One script can flush all real reports (200-item cap with no auth or rate limit) | Verified in code |
| P0-5 | 🔴 Blocker | One malformed record crashes the map for everyone | Verified in code |
| P1-1 | 🟠 High | Lost writes: read-modify-write on a single KV key | Verified in code |
| P1-2 | 🟠 High | "Report Smell" buttons drop pins at a hard-coded spot (Dave's corner) | Verified in code |
| P1-3 | 🟠 High | Default date is UTC, so evening/night reports get **tomorrow's** date | Verified in code |
| P1-4 | 🟠 High | Fake seed pins are shown as real reports and leak into the dossier | Verified in code |
| P1-5 | 🟠 High | Drag-to-move is broken (marker is destroyed mid-drag) | High confidence; needs device test |
| P1-6 | 🟠 High | Tapping the map to close a popup opens the "new report" modal | High confidence |
| P1-7 | 🟠 High | CSV export truncates at the first `#`; formula injection | Verified in code |

The rest of this document gives detail, the fix, and file/line references for each item, then covers UX, Facebook in-app browser, privacy, data quality, docs hygiene, and a test plan.

---

## 1. P0 — Blockers

### P0-1. Production has no KV binding, so every submission is lost (verified live)

**Evidence.** `GET https://neighborhood-gas-map.pages.dev/api/reports` returns `200 []` **without** a `Cache-Control: no-cache` header. In [functions/api/reports.ts](../functions/api/reports.ts), only the `if (!kv)` branch (lines 12–19) omits that header. The KV branch (lines 24–30) always sets it. So `GAS_REPORTS_KV` is not bound to the Pages project. (The Cloudflare MCP KV listing returned nothing usable, so I couldn't confirm from the account side. Check it in the dashboard: Workers & Pages → `neighborhood-gas-map` → Settings → Bindings.)

**What neighbors experience:**
1. `POST` returns `201 Created` even with no KV ([reports.ts:60–72](../functions/api/reports.ts#L60-L72)), so the client believes the save succeeded.
2. The client mirrors the pin into **that phone's** `localStorage` only ([api.ts:146–147](../src/services/api.ts#L146-L147)).
3. `GET` returns `[]`, and `fetchReports` treats an empty array as "fall back to localStorage" ([api.ts:80](../src/services/api.ts#L80)).
4. Result: every visitor sees the 3 fake seed pins plus only their own pins. Nobody sees anyone else's pins, and Dave's dossier contains only what Dave entered on his own device. **Any reports neighbors submitted since launch are gone and can't be recovered.**

**Fix:**
- Bind storage in the Pages project (and add a `wrangler.toml` so the binding is in code, not just in the dashboard). Better still, move to D1 (see P1-1).
- **Fail loudly.** If storage isn't bound, `POST` must return `503`, not `201`. The client must show "Couldn't save, please try again" instead of silently falling back to localStorage. The localStorage fallback should run only in `npm run dev` (`import.meta.env.DEV`), never in production.
- After fixing, post a short follow-up on Facebook asking anyone who already pinned to re-submit.

### P0-2. Stored XSS in marker popups

[Map.tsx:184–209](../src/components/Map.tsx#L184-L209) builds the popup with a template string and assigns it to `popupDiv.innerHTML` (line 228). `report.notes`, `report.reportedBy`, `report.observedTime`, `report.windDirection`, `smellType`, and `windCondition` are all interpolated without escaping. The server accepts any fields and any strings ([reports.ts:54–58](../functions/api/reports.ts#L54-L58) spreads `...body` directly).

**Attack:** `POST /api/reports` with `notes: "<img src=x onerror=…>"`. Once KV is bound, that script runs in every visitor's browser that opens the popup. It could delete all pins, rewrite them, or redirect neighbors to a phishing page, all from a link Dave posted.

**Fix (do both):**
- Client: build popup DOM with `textContent` / `document.createElement`, or render the popup with React (`createRoot` into `popupDiv`, or a portal). Never use `innerHTML` with user data. The list modal already does this correctly because React escapes by default.
- Server: validate and **whitelist** fields (see P0-5). Don't spread `...body`.

### P0-3. Anyone can delete or edit anyone's pin

- **UI:** [ReportListModal.tsx:133–149](../src/components/ReportListModal.tsx#L133-L149) shows a 🗑️ delete button on **every** report for **every** visitor, with no `isMine` check. Any neighbor can open "View All" and delete everyone's reports with a couple of taps, even by accident.
- **API:** `DELETE /api/reports?id=…` and `PUT /api/reports` have no authorization at all ([reports.ts:82–153](../functions/api/reports.ts#L82-L153)). IDs are public in the `GET` response. "Device ownership" is enforced only in the browser, so it's a UI hint, not a control.
- `PUT` with an unknown id returns `200` echoing the body ([reports.ts:115–118](../functions/api/reports.ts#L115-L118)), so the client believes the edit saved.
- `POST` accepts a client-supplied `id` ([reports.ts:56](../functions/api/reports.ts#L56)), so an attacker can create duplicates of an existing id. `DELETE` then removes both.

**Fix: a per-pin edit token. It keeps zero friction and needs no accounts:**
1. The server generates the `id` and a random `editToken` on `POST`, stores only `sha256(editToken)`, and returns the token once.
2. The client stores `{id, editToken}` in localStorage, replacing today's `neighborhood_my_report_ids_v1`.
3. `PUT`/`DELETE` require the `X-Edit-Token` header and compare hashes. Otherwise they return `403`. Unknown id returns `404`.
4. Remove delete from the list modal for non-owned pins.
5. **Admin moderation** (open item #3 in `stillopen.md`): don't use a passcode in the client bundle. Put `/admin` and `/api/admin/*` behind **Cloudflare Access** (free for up to 50 users, email OTP to Dave). The admin can soft-hide spam.
6. Use **soft delete** (`hidden: true`, `deletedAt`) rather than hard delete. This is evidence for Atmos/HOA, and an audit trail matters.

### P0-4. The 200-item cap lets one script wipe the dataset

[reports.ts:63–66](../functions/api/reports.ts#L63-L66) pushes new reports to the front and truncates to 200. There's no rate limit, no geofence, and no size check. A single loop of 200 POSTs (seconds of work) pushes every real report off the end, permanently. Even without malice, a real dataset that passes 200 silently loses its oldest, often most important, reports.

**Fix:**
- No silent truncation of real data. If you need a cap, reject new writes (`429`/`507`) and alert, rather than evicting.
- **Geofence:** reject any `lat/lng` outside a bounding box around the neighborhood (for example ±0.01° around the center). This alone stops most junk and "accidental coordinate spam".
- **Rate limit:** a Cloudflare WAF rate-limiting rule on `POST /api/reports`, for example 5 per IP per 10 minutes (free plan includes one rule). Or a per-IP counter in KV/D1.
- **Turnstile in "Managed / Invisible" mode.** Most neighbors never see a challenge, so it meets the no-captcha-friction requirement. Validate the token server-side on POST. (The `turnstile-spin` skill can set this up end-to-end.)
- Caps on request body size (for example 4 KB) and per-field length (notes ≤ 500, name ≤ 60, time ≤ 20).

### P0-5. One bad record crashes the map for everyone

The client trusts server data completely. A record with `timeOfDay: "x"` makes `TIME_OF_DAY_CONFIG[report.timeOfDay]` return `undefined`, and `todConf.color` throws ([Map.tsx:139–149](../src/components/Map.tsx#L139-L149)). The markers effect then dies, and with no error boundary, so does the React tree. The same applies to `INTENSITY_CONFIG`, `r.lat.toFixed` in [ExportModal.tsx:34](../src/components/ExportModal.tsx#L34), and `ReportListModal`. The server accepts anything with numeric `lat/lng`, so one request bricks the app for all neighbors.

**Fix:**
- Server-side schema validation on POST/PUT: enums for `timeOfDay`, `intensity`, `smellType`, `windCondition`; finite numbers inside the geofence; date format `YYYY-MM-DD` and not in the future or more than ~60 days back; string length caps. Build the stored object from whitelisted fields only.
- Client-side defense in depth: filter out invalid records in `fetchReports`, and add a React error boundary around the map.

---

## 2. P1 — High priority

### P1-1. Concurrency: lost writes and stale reads on a single KV key

Every POST/PUT/DELETE does `get → modify → put` on one key, `all_gas_reports`.
- Two neighbors submitting at the same moment (likely right after a Facebook post) means **last write wins, and one report vanishes**.
- KV is eventually consistent: writes can take up to ~60 s to show up at other edge locations, and the same key is limited to ~1 write/sec. A neighbor can submit and then not see their own pin after a refresh.
- KV free tier is 1,000 writes/day. That's fine for a neighborhood, but spam (P0-4) can burn through it.

**Recommendation: switch to Cloudflare D1** (SQLite at the edge, free tier, strongly consistent, one row per report). Then `INSERT`/`UPDATE … WHERE id=? AND edit_token_hash=?` are atomic, nothing gets evicted, soft-delete is a column, and filtering or sorting by date is a SQL query. It's roughly the same amount of code as now and removes a whole class of bugs. If you stay on KV, at least use one key per report (`report:<id>`) plus `kv.list({prefix})`.

### P1-2. "Report Smell" buttons pin to a hard-coded location

The header **"+ Report Smell"** button and the floating **"Pin Odor Smell"** button open the modal with `initialLocation = null` ([App.tsx:159–163](../src/App.tsx#L159-L163), [App.tsx:241–245](../src/App.tsx#L241-L245)). [ReportModal.tsx:29–31](../src/components/ReportModal.tsx#L29-L31) then defaults to `{33.03505, -97.04638}`, Dave's corner. The only hint is a tiny coordinate string in the modal header. These are the most prominent buttons in the app, so many neighbors will use them. Their reports will all pile up on one spot and **fabricate a hotspot at Dave's house** in the evidence handed to Atmos.

**Fix:** the buttons should enter a **placement mode** ("Tap the map where you smelled it", with crosshair and a Cancel button), or offer **"📍 Use my current location"** (`navigator.geolocation`, which works in the FB webview after a permission prompt). Never submit without an explicit location. Also show a mini map or confirmation of the chosen spot inside the modal.

### P1-3. Default date is in UTC

`new Date().toISOString().split('T')[0]` ([ReportModal.tsx:50](../src/components/ReportModal.tsx#L50)) returns the **UTC** date. In Flower Mound (CDT, UTC-5), anything reported after **7:00 PM** defaults to *tomorrow's* date. That's exactly the evening/night window the time-of-day hypothesis depends on. Use a local date: `new Date().toLocaleDateString('en-CA')` gives `YYYY-MM-DD` in local time.

Related data-quality issues in the same form:
- `observedTime` is free text ([ReportModal.tsx:248–256](../src/components/ReportModal.tsx#L248-L256)), so values like "Dusk" or "8ish" can't be sorted or analyzed. Use `<input type="time">`, or a time input plus an optional "approximate" checkbox.
- `timeOfDay` is chosen independently of `observedTime`, so "08:30 AM" + "Night" is allowed. **Derive `timeOfDay` from the time** (the bucket rules already exist in lines 36–44). Keep a manual pick only when the time is unknown.
- The time-of-day default is *now*, not when the smell happened. People logging yesterday evening's smell this morning will often leave it on "Morning".
- **Default-value bias:** intensity defaults to `moderate`, smell to `rotten-egg`, and wind to `light-breeze`. Neighbors who skim will accept the defaults, and the dossier will be skewed toward "moderate rotten-egg, light breeze." Start with no selection (require a choice for intensity), or default wind to "Not sure".
- If a user types a wind direction and then switches to "Calm", the hidden field still submits ([ReportModal.tsx:103,325](../src/components/ReportModal.tsx#L103)).

### P1-4. Fabricated seed reports are shown as real

[api.ts:6–50](../src/services/api.ts#L6-L50) seeds three reports with invented times, coordinates, and a fictional "Walking Neighbor". They appear on every device whenever the server returns empty, which is **today, for everyone** (P0-1). They also go into the HOA/Atmos dossier as if they were real observations. Seed data also lives only in localStorage, so it disappears as soon as one real report exists, which looks like reports vanishing.

**Fix:** delete the seeds, or use them only under `import.meta.env.DEV`. If Dave wants his own real sightings on the map, he should enter them through the app like everyone else, with accurate times. Add an empty state ("No reports yet. Be the first to pin where you smelled it") instead.

### P1-5. Drag-to-move pin is likely broken

During a drag, every `drag` event calls `onPinDrag` → `setMovingCoords` ([Map.tsx:167–171](../src/components/Map.tsx#L167-L171)). That re-runs the markers effect, whose dependency list includes `movingCoords` ([Map.tsx:277](../src/components/Map.tsx#L277)). The effect calls `markersGroup.clearLayers()` and creates new markers, so **the marker being dragged is removed after the first move event** and the drag stops. Tap-to-relocate (map click in move mode) still works, which is probably why this wasn't noticed.

**Fix:** don't rebuild markers on drag. Update state only on `dragend`, or keep the moving marker in its own ref/layer and call `setLatLng` on it. More generally, the effect tears down and rebuilds **every** marker on any change, including on selection. Keep a `Map<id, L.Marker>` and diff it instead.

*Please confirm on a phone. I reviewed the code but didn't drive a real browser.*

### P1-6. Tapping the map to dismiss a popup opens the report modal

With a popup open, tapping elsewhere on the map closes the popup (Leaflet `closePopupOnClick`) **and** fires the map `click` handler ([Map.tsx:84–90](../src/components/Map.tsx#L84-L90)), which opens "Report Gas Odor Sighting". On a phone, the natural "tap away to close" gesture therefore starts a new report every time. Combined with "tap anywhere to drop a pin", this will also produce accidental reports from people just panning or exploring.

**Fix:** ignore the map click if a popup was open at `preclick`. Better, require an explicit "Drop pin" mode (see P1-2) instead of making the whole map a submit trigger. A related issue: `selectedReportId` is never cleared when the popup closes, so any later marker rebuild **re-opens** the last popup unexpectedly ([Map.tsx:273–275](../src/components/Map.tsx#L273-L275)). Clear it on `popupclose`.

### P1-7. CSV export bugs

[ExportModal.tsx:85–89](../src/components/ExportModal.tsx#L85-L89) builds a `data:` URI and runs `encodeURI`, which **doesn't encode `#`**. The browser treats everything after the first `#` as a URL fragment, so notes like "near house #4502" or "storm drain #3" **truncate the CSV at that point** and drop the remaining rows silently.
- Fix: `new Blob([csv], {type: 'text/csv'})` + `URL.createObjectURL`, and add a UTF-8 BOM (`﻿`) so Excel shows the emoji and accents correctly.
- **CSV formula injection:** a note starting with `=`, `+`, `-`, or `@` executes as a formula when the HOA opens it in Excel. Prefix such cells with `'`.
- `observedTime` is wrapped in quotes but embedded `"` isn't escaped ([line 73](../src/components/ExportModal.tsx#L73)). Use one `csvCell()` helper for every field.
- The export omits `windDirection` and (in the text summary) `smellType`. Both are useful to Atmos.

---

## 3. Mobile & Facebook in-app browser (CC directive #3)

Most neighbors will open this inside Facebook's webview. Specific concerns:

1. **`100vh` in webviews.** `body`, `#root`, and the app wrapper use `100vh` ([index.css:33,38](../src/index.css#L33); [App.tsx:153](../src/App.tsx#L153)). In iOS Safari and the FB webview, `100vh` is taller than the visible area, so the **floating "Pin Odor Smell" bar sits under the browser toolbar**. Use `100dvh` (with a `100vh` fallback) and add `padding-bottom: env(safe-area-inset-bottom)` to bottom-anchored elements (needs `viewport-fit=cover` in the meta tag).
2. **Header height on phones.** The red safety banner wraps to 3–4 lines at 375 px. "Export for HOA / Atmos" and "+ Report Smell" aren't hidden on mobile ([Header.tsx:171,177](../src/components/Header.tsx#L171)), so the button row wraps to a second line. Estimated: the header takes ~220–260 px of a ~600 px webview, which leaves a small map. Suggestions: on mobile, show the banner as one line ("Strong smell indoors? Call Atmos 866-322-8667 / 911") that expands on tap; move Export/View All into a `⋯` menu, since the floating bar already has the main actions.
3. **Legend overlaps the floating bar.** The legend (bottom-left 24px, up to 280 px wide, expanded by default) and the floating bar (bottom-center 24px, ~300 px wide) share a bottom row and z-index 500. On a 375 px phone they overlap. Default the legend to **collapsed on mobile**, or stack it above the bar.
4. **CSV download in the FB webview.** `data:`/`<a download>` downloads often fail or do nothing inside iOS FB/Instagram webviews. This matters less (Dave will export from a laptop), but add a hint: "Download not working? Open in Safari/Chrome" via `⋯ → Open in browser`.
5. **Clipboard.** `navigator.clipboard.writeText` can be blocked in webviews. The failure is silently swallowed ([ExportModal.tsx:49–51](../src/components/ExportModal.tsx#L49-L51)). Fall back to selecting the textarea's text and showing "Press and hold to copy".
6. **Ownership storage is per-browser.** FB's webview has its own localStorage, separate from Safari/Chrome, and it can be cleared. A neighbor who pins in FB and later opens the link in Safari can't edit their own pin. That's acceptable, but set expectations in the toast: "You can edit this pin from this browser on this phone."
7. **Zoom disabled.** `maximum-scale=1, user-scalable=no` ([index.html:5](../index.html#L5)) blocks pinch-zoom of the UI for low-vision users (many neighbors may be older). Remove it. Prevent iOS auto-zoom on focus by making inputs `font-size: 16px` instead (currently 14px, [index.css:253](../src/index.css#L253)).
8. **Tap targets.** Map dots are 16px with a 20px hit box ([Map.tsx:156](../src/components/Map.tsx#L156)). That's below the ~44px recommended touch target, and with several pins near the bridge, people will mis-tap. Keep the 16px visual but enlarge the transparent hit area to 36–44px. Consider marker clustering if counts grow.
9. **Popup buttons** (Move/Edit/🗑️) are 11px text with ~24px height, which is hard to hit. Enlarge them, and put more space between 🗑️ and Edit.
10. **Undo toast** (bottom 80px) can sit on top of the legend and the floating bar. Its `×` has no accessible label.

---

## 4. Product, UX & data-quality feedback

1. **Intensity isn't visible on the map.** AGENTS.md says pins "scale by odor intensity", and `INTENSITY_CONFIG.haloSize` exists ([types.ts:88–100](../src/types.ts#L88-L100)) but is never used. Faint and moderate look identical, and only strong pulses. Scale the dot slightly (12/16/20px) or add a ring for moderate.
2. **Color-only encoding.** Time of day is shown by color alone, which won't work for color-blind neighbors or printed B&W copies for the HOA. Add a shape or letter (M/A/E/N) on hover/legend, or mention it in the popup (already present). The dossier text covers it.
3. **The filter is half-built.** `FilterState` includes `intensity` and `date`, but there's no UI for either ([Header.tsx:183–259](../src/components/Header.tsx#L183-L259)), and `date` is ignored in filtering ([App.tsx:69–75](../src/App.tsx#L69-L75)). A **date range filter ("last 7 days")** is the most valuable addition: it shows Atmos whether the problem is ongoing or resolved.
4. **Export colors don't match the map.** The dossier's Afternoon tile is orange (`#ea580c`) while the map uses blue (`#0284c7`). Evening and Night are merged into one purple tile ([ExportModal.tsx:189–216](../src/components/ExportModal.tsx#L189-L216)). Use `TIME_OF_DAY_CONFIG` everywhere. The `--morning-color`/`--afternoon-color` CSS vars in [index.css:10–13](../src/index.css#L10-L13) are stale (old palette) and unused. Delete them.
5. **"Chronological log" isn't chronological.** The list and export are in insertion order (newest submitted first), not observation order. Sort by `observedDate` + time. The Atmos summary should probably be oldest → newest.
6. **"Locate" in the list** does nothing if the report is filtered out, and doesn't zoom. Clear filters for that pin (or warn), then `flyTo` and open the popup.
7. **Dossier should include a map image or link.** Atmos techs think in locations. Include a link to the live map, nearest-street/landmark text, and Google Maps links per coordinate (`https://maps.google.com/?q=lat,lng`). That's just a URL, with no API or billing risk. A "Print" stylesheet for the dossier would also help Dave hand paper to the HOA.
8. **Useful analytics for the hypothesis:** a small time-of-day histogram and "reports by day" in the dossier. Optionally record the temperature at observation time (Open-Meteo is free and keyless), since the Atmos tech's theory is temperature swings. That would let the data test the theory directly.
9. **"Smelled nothing" reports.** Consider a simple "I walked here and smelled nothing" option. Negative observations help Atmos narrow the source, but this is optional scope.
10. **Satellite toggle** has no label on mobile (icon only). The layer icon isn't self-explanatory, so add a small "Satellite" label.
11. **No Escape-to-close or focus trap on modals.** Time-of-day cards are `<div onClick>` and can't be reached by keyboard ([ReportModal.tsx:200–208](../src/components/ReportModal.tsx#L200-L208)). Close buttons lack `aria-label`. Use `<button>` or radio inputs.
12. **Delete confirmation** uses `window.confirm`, which some webviews suppress (returns false immediately), making delete silently do nothing. Use an in-app confirm.
13. The edit form sends `reportedBy: undefined` when cleared. In the local fallback path, this renders as "Reported by: **undefined**" ([ReportModal.tsx:91](../src/components/ReportModal.tsx#L91); [api.ts:166–170](../src/services/api.ts#L166-L170)).
14. `deleteReport` ignores the server response ([api.ts:197–203](../src/services/api.ts#L197-L203)). If the server delete fails, the pin disappears locally but comes back on reload.
15. **No refresh.** Reports load once on mount. Add pull-to-refresh or a periodic re-fetch (every 60 s) so a neighbor sees others' pins without reloading.

---

## 5. Privacy & data hygiene (overlaps the Codex directive; CC observations)

- **Everything is world-readable.** `GET /api/reports` is a public JSON endpoint, and the link is being shared on Facebook (and can be re-shared). Names plus street ("Dave G., Neighbor on Rosewood Trail" is the suggested placeholder, [ReportModal.tsx:365](../src/components/ReportModal.tsx#L365)) plus satellite-precise pins equals a public map of who lives where. Suggestions:
  - Change the placeholder to initials, for example "e.g. D.G. (optional)", and add a one-line notice: "Everything you enter here is public."
  - Consider showing `reportedBy` **only in the admin export**, not in public popups. That needs the admin endpoint from P0-3.
  - Notes are free text. Add a hint: "Describe the place, not people. No phone numbers or addresses."
- **The seed data publicizes Dave's own location** ("Outside corner house on Golden Aspen Dr", "Dave (Golden Aspen Dr)"). Dave already said this on Facebook, but on a public, indexable map it's more permanent. Removing the seeds (P1-4) solves it.
- Add `<meta name="robots" content="noindex">` so the page and API don't end up in search results.
- **Security headers:** only `referrer-policy` is set on the live site. Add a `public/_headers` file with a Content-Security-Policy (script-src 'self'; img-src self + OSM + Esri tiles; style-src self + Google Fonts + unpkg), `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`. The CSP is a strong second line of defense for P0-2.
- **Error leakage:** 500 responses return raw `err.message` ([reports.ts:31–36](../functions/api/reports.ts#L31-L36)). This is low risk, but return a generic message and log the detail.
- **Data retention:** decide and state how long reports are kept and who can see the export (for example, "deleted 90 days after the issue is resolved").

---

## 6. Engineering hygiene

- **The edge function isn't type-checked.** `tsconfig.json` only includes `src`, and `@cloudflare/workers-types` isn't installed. Running `tsc` on `functions/api/reports.ts` gives `Cannot find name 'KVNamespace'` / `'PagesFunction'`. Add a `functions/tsconfig.json` with workers types so the build catches backend errors.
- **No `wrangler.toml`.** Bindings live only in the dashboard. That's likely how P0-1 happened. Commit a `wrangler.toml` (`pages_build_output_dir = "dist"`, KV/D1 binding IDs, which are not secrets) so `wrangler pages dev` works locally with real bindings.
- **No tests.** At least add unit tests (Vitest) for the server validator, the time-of-day bucketing, the CSV builder (`#`, quotes, commas, newlines, `=` prefix), and the local-date default. Add one Playwright smoke test at an iPhone viewport.
- **Git workflow drift:** AGENTS.md says work happens on `feature/<name>` branches and Dave merges, but all 7 commits went straight to `main`. That's fine for genesis, but enforce it for the fixes above, since `main` auto-deploys to the live link neighbors are using.
- `tsconfig.tsbuildinfo` is in the repo root (it's gitignored, so this is harmless).
- `npm audit --omit=dev`: 0 vulnerabilities. Production build: clean, 420 KB JS / 126 KB gzip. That's acceptable, and `lucide-react` is tree-shaken.
- The Leaflet CSS loads from unpkg with SRI (good). Since `leaflet` is already an npm dependency, `import 'leaflet/dist/leaflet.css'` would remove the third-party CDN dependency.

---

## 7. Documentation inconsistencies

- **Domain contradiction:** [AGENTS.md:13](../AGENTS.md#L13) and [AGENTS.md:52](../AGENTS.md#L52) say production is `gas.galindo.co`. `ORIGINAL_REQUEST.md` §4.4, `settled.md` §3.4, and `stillopen.md` #1 all say it will **not** use `galindo.co`. (`gas.galindo.co` doesn't resolve, which matches the latter.) Fix AGENTS.md.
- **`settled.md` has two "§3 Product Invariants & Pin Schema" sections** with conflicting schemas (`timestamp` vs `observedDate`/`observedTime`), and the numbering jumps from 1 to 4. Delete the first one. Also document `windDirection` and `updatedAt`, which exist in code but not in the schema.
- **`stillopen.md` item #1 is marked "Settled"** and item #2 is done. Move both to `settled.md`. Item #3 (moderation) is answered by P0-3 above.
- **`STATUS.md`** still says "Phase 1 — Project Genesis" while the app is live, and claims "KV support" without noting KV isn't bound. Update it after triage.
- `ORIGINAL_REQUEST.md` §3.3 lists "Strong gets an animated radar pulse" and AGENTS.md says "scale by odor intensity". Only the pulse is implemented (see §4.1).

---

## 8. Suggested fix order

1. **Today:** bind storage *or* temporarily show a "Reporting paused, back shortly" banner, so neighbors stop losing submissions. Make POST fail loudly without storage (P0-1).
2. Remove `innerHTML` with user data, and add server validation and geofence (P0-2, P0-5).
3. Edit tokens, remove public delete from the list, and Cloudflare Access admin with soft delete (P0-3).
4. Move to D1, remove the 200 cap, add rate limit and invisible Turnstile (P0-4, P1-1).
5. Placement mode / "Use my location", local date, derived time of day, remove seeds (P1-2, P1-3, P1-4).
6. Fix marker drag and popup-dismiss behavior, CSV Blob export (P1-5, P1-6, P1-7).
7. Mobile layout (`dvh`, compact header, collapsed legend, tap targets), then UX polish.
8. Facebook follow-up post: "The map is fixed. If you pinned before <date>, please re-pin."

Items 1–3 are small, roughly an afternoon of work. Items 4–6 are another session.

---

## 9. Manual test plan (run after fixes, on a real phone inside the Facebook app)

| # | Test | Expected |
|---|------|----------|
| 1 | Phone A pins a report; Phone B (different network) reloads | B sees A's pin within seconds |
| 2 | A and B submit within the same second | Both pins persist |
| 3 | Submit with notes `<b>hi</b><img src=x onerror=alert(1)>` | Shown as literal text; no alert |
| 4 | `curl -X DELETE …?id=<someone else's id>` | `403` |
| 5 | POST with `lat: 0, lng: 0` or `timeOfDay: "x"` | `400`; map still loads for everyone |
| 6 | Tap header "+ Report Smell" | Asked to place pin or use location; no silent default coordinate |
| 7 | At 8:30 PM CDT, open the form | Date defaults to **today**, time of day = Evening |
| 8 | Drag own pin in move mode, then Save | Pin follows finger smoothly; new position persists after reload |
| 9 | Open a popup, tap empty map to close | Popup closes; **no** report modal |
| 10 | Notes containing `#4`, `"quoted"`, a comma, a newline, and `=SUM(1)`; export CSV; open in Excel | All rows present; text intact; no formula executed |
| 11 | iPhone FB webview: is the floating bar fully visible above the toolbar? | Yes |
| 12 | 375 px width: legend and floating bar | No overlap |
| 13 | Pinch-zoom the page UI | Allowed |
| 14 | Pin in FB webview, reopen the link in Safari | Pin visible; edit not offered (expected); no errors |
| 15 | Fresh device, empty database | Empty-state message, no fake pins |

---

*CC is available to implement any of these on a `feature/` branch for Dave's review. Codex's adversarial/privacy review should cover overlapping areas (P0-3, P0-4, §5) independently. Disagreements are welcome and should be captured in `docs/decisions/stillopen.md`.*
