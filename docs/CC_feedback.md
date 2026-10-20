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

---
---

# 2nd Pass

**Date:** October 20, 2026 (evening)
**Commit reviewed:** `6d95b38` (`main`). I confirmed the live site serves the same bundle as a local build of this commit (`index-BsVthRrT.js`).
**Method:** Re-read every changed file (`functions/api/reports.ts`, `schema.sql`, `src/services/api.ts`, `Map.tsx`, `App.tsx`, `ExportModal.tsx`, `ReportListModal.tsx`, `ReportModal.tsx`) and checked each first-pass item against the code. I rebuilt the app (clean: 422 KB / 127 KB gzip) and probed the live API with requests that **cannot create or change data**: GETs, and writes the server rejects before touching the DB. I did **not** POST a valid report, so I couldn't test the Turnstile bypass or a full create→edit→delete cycle live. Those conclusions come from the code.

## 2P-0. Verdict

**Big improvement. The four worst problems are fixed, and the app is now safe to share with neighbors you know.** The shared map works (D1 is bound and verified), the popup injection hole is closed, and other people's pins can no longer be deleted or edited. Before promoting it widely (re-sharing, the HOA page, a Nextdoor post), close the **three remaining high items** in §2P-2: bot/spam protection isn't actually switched on, edits skip validation, and the "Use My GPS" button will happily pin someone's office in Dallas.

STATUS.md says the review items were fixed. That's accurate for the security blockers, but most of the mobile, UX, privacy, and docs items from the first pass are **not started** (those files are unchanged). See §2P-4.

### Live probe results

| Probe (non-mutating) | Result | Verdict |
|---|---|---|
| `GET /api/reports` | `200 []` with `Cache-Control: no-cache` (D1 branch) | ✅ D1 bound; DB currently empty |
| `PUT` with nonexistent id | `404 Report not found` | ✅ D1 path (the KV/unbound path would return 200) |
| `DELETE` nonexistent id, no token | `404` | ✅ |
| `POST` with `timeOfDay:"x"` | `400 Invalid timeOfDay value` | ✅ |
| `POST` with `lat:"abc"` | `400 Valid numerical coordinates required` | ✅ |
| `POST` with malformed JSON | `500` with raw parser message | ⚠️ should be `400` with a generic message |
| GET response fields | No `editToken`/hash exposed | ✅ |
| Security headers | Only `x-content-type-options: nosniff` and `referrer-policy` | ⚠️ no CSP / `noindex` |

## 2P-1. First-pass items: scorecard

| Item | Status | Notes |
|---|---|---|
| P0-1 KV unbound, silent data loss | ✅ **Fixed** (live) | D1 bound. Client no longer falls back to localStorage in prod. The server's "no storage" branch still returns `201` (see 2P-2.4) |
| P0-2 Stored XSS | ✅ **Fixed** | Popup built with DOM nodes + `textContent` ([Map.tsx](../src/components/Map.tsx)). List modal was already safe |
| P0-3 Anyone can delete/edit | ✅ **Fixed** on D1 path | Per-pin `editToken`, SHA-256 hash on server, soft delete, list modal delete restricted to own pins. Small fail-open gap: 2P-2.5 |
| P0-4 200-cap wipe / spam | 🟡 **Partial** | Cap removed and data preserved (D1 + soft delete) ✅. But **no working bot protection or rate limit** (2P-2.1), and GET's `LIMIT 500` means spam can still push real pins off the map |
| P0-5 Bad record crashes map | 🟡 **Mostly fixed** | POST validates `timeOfDay`/`intensity`/coords. Client falls back safely for bad enums and coords. **PUT does no validation** (2P-2.2). No error boundary |
| P1-1 KV lost writes | ✅ **Fixed** | One row per report in D1 |
| P1-2 Default to Dave's corner | ✅ **Fixed** | Placement mode + "Use My GPS". The fallback coordinate still sits in [ReportModal.tsx:32](../src/components/ReportModal.tsx#L32) as dead code; replace it with a guard |
| P1-3 UTC date / data quality | 🟡 **Partial** | Local date ✅. Free-text time, independent time-of-day, and default-value bias (moderate / rotten-egg / light breeze) **not changed** |
| P1-4 Fake seed pins | ✅ **Fixed** | Seeds removed and legacy `seed-*` filtered out |
| P1-5 Drag-to-move broken | ✅ **Fixed in code** | Marker rebuild no longer depends on `movingCoords`; position synced via `setLatLng`. Still needs a phone test |
| P1-6 Popup dismiss opens modal | ✅ **Fixed** | 250 ms `popupclose` guard. Leaflet closes the popup on `preclick`, so the guard catches it |
| P1-7 CSV `#` truncation / injection | ✅ **Fixed** | Blob + BOM + formula prefix + uniform quoting. `windDirection` still not exported (minor) |

## 2P-2. Remaining & new issues (by priority)

### 2P-2.1 🟠 HIGH: Turnstile isn't active, and there's no rate limit

- **Server:** verification only runs `if (TURNSTILE_SECRET_KEY && body.turnstileToken)` ([reports.ts:153](../functions/api/reports.ts#L153)). A request that **omits** the token skips the check entirely. It's opt-in for attackers.
- **Client:** there's no Turnstile widget or script anywhere (`index.html` and `src/`), and `handleAddReport` calls `submitReport(input)` with no token ([App.tsx](../src/App.tsx)). So even honest neighbors never send one.
- No rate limit exists either. One script can insert thousands of rows. D1 keeps them (good), but `GET … LIMIT 500` means 500 junk rows hide every real report from the map **and from the HOA/Atmos export**, since the export uses the same list.

**Fix:** (a) If the secret is configured, **require** the token: missing → `403`. (b) Add the Turnstile widget in invisible/managed mode and pass the token through `submitReport`. (c) Add a Cloudflare WAF rate-limiting rule on `POST /api/reports` (for example 5 per IP per 10 min). This is dashboard-only with no code. The `turnstile-spin` skill can do (a) and (b) end to end. Keep the Turnstile secret as a Pages secret, not in a file.

### 2P-2.2 🟠 HIGH: `PUT` skips all validation

Anyone can create one pin, get its edit token, then `PUT` arbitrary values ([reports.ts:351–361](../functions/api/reports.ts#L351-L361)):
- `timeOfDay`, `intensity`, `smellType`, `windCondition`, `observedDate`, `observedTime` accept **any string of any length** (no enum check, no cap). Only notes, name, and wind direction are capped.
- `lat`/`lng`: `Number("abc")` gives `NaN`, and there's no range check, so `lat: 999` is accepted.
- POST has the same unbounded-length issue for `smellType`, `windCondition`, and `observedDate`. There's also no overall body-size limit. A few multi-megabyte rows would make every neighbor's phone download megabytes on each page load.

The client's enum fallbacks stop the crash, but the record shown in the dossier would be garbage. **Fix:** write a single `validateReport(input, {partial})` function used by both POST and PUT: enums for all four categorical fields, `YYYY-MM-DD` date (not in the future, not more than ~90 days back), time ≤ 20 chars, finite coords in a bounding box (see 2P-2.3), and reject bodies over ~4 KB (`content-length` check) before parsing.

### 2P-2.3 🟠 HIGH: "Use My GPS" and the geofence decision

Settled decision #4 rejected "device GPS geofencing" so neighbors can report from work. That's reasonable, but it merges two different things:
- **Device location** ("where is the phone now"): correctly *not* required.
- **Pin location** ("where is the pin"): this *should* be limited to the neighborhood. A pin in Dallas is never a valid report about the Golden Aspen pond, no matter where the reporter is sitting. The server currently accepts any coordinate on Earth ([reports.ts:176](../functions/api/reports.ts#L176)).

The two interact badly. The exact scenario the decision was meant to support ("I'm at work, let me report the smell from this morning") is the one where **"Use My GPS" is wrong**: it pins the office. Then `handleUseCurrentLocation` in [App.tsx](../src/App.tsx) opens the form immediately without showing where the pin landed.

**Fix:**
1. Server: reject pin coordinates outside a generous neighborhood box (for example ±0.015° lat / ±0.018° lng around `[33.0352, -97.0482]`, about 1.5 km). This limits the *pin*, not the reporter.
2. Client: if the GPS fix is more than ~800 m from the neighborhood, don't open the form. Show "You seem to be away from the neighborhood. Tap the map where you smelled it instead." Otherwise, `flyTo` the GPS point and show a draggable preview pin with **Confirm** before opening the form. GPS on phones can be off by 20–50 m, which matters for "which side of the pond".
3. Ask Dave to record the clarified decision in `settled.md` (pin geofence yes, device geofence no).

### 2P-2.4 🟡 MEDIUM: Server still "succeeds" when storage is missing, and the KV fallback is still the old insecure code

- If `DB` (and KV) are ever unbound (for example a new Pages environment, preview branch, or binding typo), `POST` still returns **`201` with an edit token** while saving nothing ([reports.ts:218–288](../functions/api/reports.ts#L218-L288)). `PUT` returns `200` echoing the body ([reports.ts:407](../functions/api/reports.ts#L407)), and `DELETE` returns success. That's the original P0-1 failure mode, now one binding mistake away.
- The **KV fallback** paths keep the first-pass problems: PUT spreads `...body` with **no token check** ([reports.ts:391–405](../functions/api/reports.ts#L391-L405)), DELETE has no token check and hard-deletes ([reports.ts:484–491](../functions/api/reports.ts#L484-L491)), and writes are read-modify-write.

**Fix:** delete the KV fallback entirely, since it's unused and only adds risk, and return `503 {"error":"Storage not configured"}` when `DB` is missing. Also commit a `wrangler.toml` with the D1 binding (IDs aren't secrets), so the binding is in version control.

### 2P-2.5 🟡 MEDIUM: Token check fails open for rows without a hash

`if (existing.edit_token_hash && clientHash !== existing.edit_token_hash)` ([reports.ts:343](../functions/api/reports.ts#L343), [:463](../functions/api/reports.ts#L463)) means any row with a NULL hash can be edited or deleted by **anyone who sends any token**. No such rows exist today (the DB is empty and POST always sets one). But a row Dave adds by hand in the D1 console, or a future import, would be open to everyone. Fail closed: no hash means admin-only.

### 2P-2.6 🟡 MEDIUM: Failed delete/move/undo give no feedback

`deleteReport` and `updateReport` now correctly throw on server errors. But `handleDeleteReport`, `handleUndoRecent`, and `handleSaveMovedPin` in [App.tsx](../src/App.tsx) have no `try/catch`, so a failure (bad network on a walk, expired token after clearing browser data) becomes an unhandled promise rejection. The **Undo** button looks like it did nothing, and the move banner stays stuck. Catch the error and show a toast ("Couldn't delete, check your connection and try again"). The report form already handles this well; copy that pattern.

### 2P-2.7 🟢 LOW: smaller items

- **Malformed JSON returns `500`** with the raw parser message. It should return `400`. All error responses still echo `err.message`; return a generic message.
- **`ensureD1Table` runs `CREATE TABLE IF NOT EXISTS` on every request**, which adds an extra DB round trip to every GET. The indexes in `schema.sql` are only created if someone ran that file. Apply `schema.sql` once with `wrangler d1 execute` and drop the per-request call.
- **Server default `observedDate`** still uses UTC ([reports.ts:208](../functions/api/reports.ts#L208)). The client always sends a date, so this matters little, but it's the same bug as P1-3.
- **Admin key:** `ADMIN_API_KEY` via the `X-Admin-Key` header works for Dave through curl or the D1 console. That's fine for now, but there's no admin UI, and the comparison isn't constant-time (low risk at this scale). If it's set, make sure the value lives in Bitwarden (`bws`) and as a Pages **secret**, not a plain variable. Cloudflare Access remains the nicer long-term option.
- **Tap-to-pin outside placement mode** still opens the form on any map tap, so placement mode adds an option without making it mandatory. That's acceptable since nothing saves without Submit, but consider making the map passive (pan/zoom only) unless you're in placement or move mode. That removes surprise forms while panning.
- `selectedReportId` still isn't cleared on popup close, so the last popup can re-open when the list refreshes.
- `functions/` still isn't type-checked (`tsconfig.json` includes only `src`). That would have caught nothing here, but it's free insurance.

## 2P-3. What I'd still test on a real phone (inside the Facebook app)

These are from the first-pass test plan (§9) and still unverified in a real browser:
- #1/#2: two phones see each other's pins, including near-simultaneous submits.
- #8: drag-to-move with a finger (the code fix looks right, but Leaflet drag on touch is the thing to watch).
- #9: tap away from a popup. No form should open.
- #10: CSV with `#`, quotes, commas, newlines, and `=SUM(1)` opens cleanly in Excel.
- New: deny location permission on "Use My GPS". Expect the alert and still being able to tap the map.
- New: clear site data (or use a different browser), then try to delete an old pin. The delete button shouldn't appear, and a forced attempt should show a clear error.

## 2P-4. First-pass items not yet started

These files are unchanged since the first pass. None of these block a soft launch, but together they decide whether older or less technical neighbors can use the app comfortably on a phone. Full details are in the first-pass sections.

- **§3 Mobile / Facebook webview (all 10 items):** `100vh` → `100dvh` + safe-area (floating bar can hide under the toolbar); oversized header on phones; legend overlapping the floating bar at 375 px; `user-scalable=no` still set; 16 px pins with 20 px hit areas; small popup buttons; clipboard/download fallbacks in the webview.
- **§4 UX:** intensity not visible on the map (`haloSize` unused); no date-range filter (high value for showing Atmos whether this is ongoing); export tile colors still don't match the map (Afternoon orange vs blue); list/export sorted by submit time, not observation time; no auto-refresh; `window.confirm` for delete; modal accessibility (div-based time cards, no Escape/focus trap, no `aria-label`s).
- **§5 Privacy:** name placeholder still suggests "Dave G., Neighbor on Rosewood Trail"; no "everything here is public" notice; no `noindex`; no CSP (`public/_headers`). Codex raised the same privacy and retention points; the decision is still open.
- **§6 Engineering:** no `wrangler.toml`, no tests. Even a handful of Vitest cases on the validator and CSV builder would have caught 2P-2.2.
- **§7 Docs:** AGENTS.md lines 13 and 51 still say `gas.galindo.co`. `settled.md` still has two conflicting "§3 Product Invariants" sections. `stillopen.md` still lists #1 and #2 (settled) and #3 (moderation, now answered by edit tokens + soft delete + admin key). Move them to `settled.md`.
- **Process:** all fixes again went straight to `main`, which auto-deploys to the live link neighbors use. For the next round, use a `feature/` branch so Cloudflare produces a preview URL to test on a phone before merging.

## 2P-5. Suggested next round (in order)

1. **Make bot protection real:** Turnstile required + widget wired + WAF rate-limit rule (2P-2.1).
2. **One shared validator for POST and PUT**, plus a pin geofence and body-size cap (2P-2.2, 2P-2.3 server part).
3. **GPS sanity check and confirm-preview** (2P-2.3 client part).
4. **Remove the KV fallback**, return 503 without `DB`, fail closed on a missing hash, and commit `wrangler.toml` (2P-2.4, 2P-2.5).
5. **Error toasts** for delete/move/undo (2P-2.6).
6. Mobile layout pass (`dvh`, compact header, collapsed legend, tap targets, re-enable zoom), then the §4/§5 items.

Items 1–5 are a short session. After that, I'd consider the app fully ready for wide sharing.

---
---

# 3rd Pass

**Date:** October 20, 2026 (night)
**Commits reviewed:** `726b897` (hardening pass 3) and `de5541b` (removes `wrangler.toml`), on `main`. The live site serves the same bundle as a local build of `de5541b` (`index-nakH6Fb_.js`).
**Method:** Same as the 2nd pass. I re-read the rewritten `functions/api/reports.ts`, the `App.tsx` / `index.css` diffs, and the doc changes. I rebuilt locally (clean) and probed the live API with requests that **can't write data** (GETs, and POST/PUT bodies the server rejects). I still haven't sent a valid POST, so the full create→edit→delete cycle on a phone remains Dave's test to run (§2P-3).

## 3P-0. Verdict

**The backend is now in good shape.** The 2nd-pass server items are almost all closed: one shared validator for create and edit, a pin geofence, fail-closed auth, a 503 when storage is missing, the insecure KV fallback removed, and 400 for malformed JSON. **Two things should be fixed before wider sharing**, and both are small:

1. **Bot protection is still off in production** (verified live). See 3P-2.1.
2. **A regression from the new error handling:** a failed submit or edit now **closes the form and throws away what the neighbor typed**. See 3P-2.2.

Fix those two and I'm comfortable with the link being shared broadly. Everything after §3P-2.2 is polish.

### Live probe results

| Probe (non-mutating) | Result | Verdict |
|---|---|---|
| `GET /api/reports` | `200 []`, `Cache-Control: no-cache` | ✅ D1 serving (DB currently empty) |
| `POST` in-fence, `timeOfDay:"x"`, **no Turnstile token** | `400 Invalid timeOfDay…` | ⚠️ Request got **past** the Turnstile gate, so `TURNSTILE_SECRET_KEY` isn't set (3P-2.1) |
| `POST` at downtown Dallas coords | `400 Pin coordinates must be within the Flower Mound neighborhood…` | ✅ Pin geofence live |
| `POST` malformed JSON | `400 Malformed JSON payload` | ✅ (was 500) |
| `PUT` nonexistent id | `404` | ✅ |

## 3P-1. 2nd-pass items: scorecard

| Item | Status | Notes |
|---|---|---|
| 2P-2.1 Turnstile / rate limit | 🔴 **Not effective** | Server logic fixed (token now required *when the secret is set*) ✅. But the secret isn't set, there's still **no widget in the client**, and there's no evidence of a WAF rate-limit rule. See 3P-2.1 |
| 2P-2.2 PUT validation | ✅ **Fixed** | `validateReportFields()` shared by POST and PUT: enums for all four categorical fields, date format and 90-day window, length caps, finite coords. Body-size cap not added (minor, 3P-3) |
| 2P-2.3 Pin geofence / GPS | 🟡 **Mostly fixed** | Server pin box (lat 33.01–33.06, lng −97.08 to −97.02) ✅ live. Client rejects GPS fixes more than ~2.4 mi away ✅. **No map preview/confirm** before the form opens, and the radius is generous (3P-2.3) |
| 2P-2.4 Unbound storage / KV fallback | ✅ **Fixed** | KV code removed; all four methods return `503` without `DB` |
| 2P-2.5 Fail-open token check | ✅ **Fixed** | Rows with no hash now require the admin key |
| 2P-2.6 Error feedback | 🟡 **Regressed** | Alerts added, but the try/catch placement swallows errors the form relies on (3P-2.2) |
| 2P-2.7 Malformed JSON → 400 | ✅ Fixed | |
| 2P-2.7 Per-request `CREATE TABLE` | ✅ Fixed | Removed. GET works, so the schema is applied |
| 2P-2.7 Server UTC default date | ✅ Fixed | Date is now required and validated; no server default |
| 2P-2.7 Error detail leakage | 🟡 Open | Responses now include `details: <raw DB error>` |
| 2P-2.7 Tap-to-pin outside placement mode, `selectedReportId` on close, `functions/` type-check | ⬜ Not started | `Map.tsx`/`tsconfig.json` unchanged |
| `wrangler.toml` | 🟡 **Added then removed** | See 3P-2.4 |
| `100dvh` | ✅ Partial | `body`/`#root` use `100dvh` with a `100vh` fallback, and the app wrapper is `100%`. Safe-area padding not added |
| Docs: AGENTS.md domain, settled.md duplicate §3 | ✅ Fixed | |

## 3P-2. Remaining issues (by priority)

### 3P-2.1 🟠 HIGH: Bot protection is still off in production (verified)

The server code is now correct: if `TURNSTILE_SECRET_KEY` is set, a POST without a token gets `403`. **But it isn't set.** My token-less POST reached field validation and came back `400` instead of `403`. Also:
- There's still **no Turnstile widget** anywhere in `index.html` or `src/`, and `App.tsx:139` calls `submitReport(input)` with no token.
- **Important:** if Dave sets the secret *now*, before the widget ships, **every neighbor's submission will fail with 403.** Ship the widget first, then set the secret.
- `settled.md` #4 and `STATUS.md` describe the app as "Protected via Cloudflare Turnstile". That's not true yet, so either fix the docs or finish the work.

**Fix, in this order:**
1. Create a Turnstile widget (Managed or Invisible) for `neighborhood-gas-map.pages.dev`. The site key is public and can go in code.
2. Render it in the report form, put the token in the submit payload, and reset the widget after each submit (tokens are single-use).
3. Deploy, then set `TURNSTILE_SECRET_KEY` as a Pages **secret** (Settings → Variables and Secrets → Encrypt). Keep the value in Bitwarden (`bws`), never in a file.
4. Add a WAF rate-limiting rule (Security → WAF → Rate limiting rules) on `POST /api/reports`, for example 5 per IP per 10 minutes. Dashboard only, no code.

The `turnstile-spin` skill can do steps 1–3 end to end.

### 3P-2.2 🟠 HIGH (regression): A failed save closes the form and loses the neighbor's input

`handleAddReport` and `handleUpdateReport` in [App.tsx:137–160](../src/App.tsx#L137-L160) now **catch the error, show an `alert`, and return normally**. `ReportModal.handleSubmit` ([ReportModal.tsx:83–110](../src/components/ReportModal.tsx#L83-L110)) treats a normal return as success and calls `onClose()`. So on any failure (a weak signal on the trail, a geofence or validation `400`, and once 3P-2.1 is done, a Turnstile `403`):
1. The alert shows "Submission failed…".
2. The **form closes and everything the neighbor typed is gone**.
3. The form's own inline error box (which used to handle this correctly) never shows.

Knock-on effects:
- `handleSaveMovedPin`'s `catch` is dead code. A failed move still exits move mode, and the pin snaps back to its old spot.
- `handleUndoRecent`'s `catch` is also dead code (harmless).

**Fix:** have `handleAddReport` and `handleUpdateReport` **re-throw** after any cleanup, or drop their try/catch and let `ReportModal` show its inline error. Keep the alert/try-catch only in the handlers no form calls: delete, move-save, and undo. In `handleSaveMovedPin`, call `updateReport` directly, so a failure keeps move mode active and the user can retry.

*Test:* turn on airplane mode, fill in the form, and submit. Expected: an error message inside the form with all fields still filled in.

### 3P-2.3 🟡 MEDIUM: GPS button: no preview, and a generous radius

The proximity check is in place (`Math.hypot(...) > 0.035°`, about 2.4 mi). Two gaps:
- **No visual confirmation.** A GPS fix inside the radius still jumps straight into the form. The neighbor never sees where the pin landed, and phone GPS can be off by 20–50 m, which matters for "this side of the pond or that side". Better: `flyTo` the fix, show a draggable preview pin, and open the form on **Confirm**.
- **2.4 mi is wider than the neighborhood.** Someone at the Kroger or a school pickup line ~2 miles away still passes, and their pin lands there. That's also inside the server box, so it's accepted. I'd tighten the GPS check to ~0.5 mi (`0.008°`). The server box can stay generous, since it's there to block junk, not to judge accuracy.
- The circle and the server box don't line up exactly. A fix near the north edge (lat > 33.06) passes the client check but gets a server `400`, and with 3P-2.2 the form then closes. This edge case goes away if the GPS radius is tightened.

### 3P-2.4 🟡 MEDIUM: `wrangler.toml` was added with a bad ID, then deleted

`726b897` added a `wrangler.toml` with `database_id = "neighborhood-gas-db"`. That's the database *name*; `database_id` must be the D1 **UUID**. The build failed, and `de5541b` deleted the file. The binding is back to living only in the dashboard. That configuration drift is what caused P0-1 in the first place.
- **Fix:** restore the file with the real UUID (Dashboard → Storage & Databases → D1 → `neighborhood-gas-db` → copy the Database ID, or run `wrangler d1 list`). The UUID is **not a secret** and is safe to commit. Note that once a `wrangler.toml` exists, Pages treats it as the source of truth for bindings, so it has to be correct. Test on a `feature/` branch preview deploy before merging.
- **Docs:** `STATUS.md` still says "Configuration in Git: Added `wrangler.toml`" and links to a file that no longer exists. Correct it.

### 3P-2.5 🟢 LOW: Smaller backend items

- **Error detail leakage:** 500 responses now return `details: msg`, which is raw D1 error text including SQL hints. Log it with `console.error` (visible in Pages → Functions → Logs) and return only the generic message.
- **Impossible dates pass validation:** `2026-02-31` passes the regex, and JS rolls it to Mar 3, so it's accepted and **stored as "2026-02-31"**. Fix: after parsing, check that `dateObj.toISOString().slice(0,10) === observedDate`.
- **Edits lock after 90 days:** PUT re-validates the stored date against the 90-day window. Once a report is more than 90 days old, its owner can't move, edit, or correct it, and the error says the date is invalid. Apply the window only when `observedDate` is actually being changed.
- **No request-size cap:** fields are capped after parsing, but the body itself isn't. Reject when `content-length` is over ~8 KB before calling `request.json()`. Low risk on Workers, but cheap.
- **Admin key comparison** is still a plain `===` (not constant-time). Negligible at this scale; noted for completeness.

### 3P-2.6 🟢 LOW: Docs accuracy

- `settled.md` #4 and `STATUS.md` say Turnstile protects the app, and `STATUS.md` says `wrangler.toml` is in git. Neither is true yet (3P-2.1, 3P-2.4).
- `settled.md` §2.3 and STATUS describe the geofence as "±0.025° … ~2.5 miles". The code uses a lat 33.01–33.06 × lng −97.08 to −97.02 box (about 3.4 × 3.5 mi) and a 0.035° GPS radius. Make the docs match the code, or vice versa.
- `stillopen.md` is still unchanged (items #1 and #2 are settled; #3 moderation is answered).

## 3P-3. Still not started from the first pass (unchanged files)

`Header.tsx`, `Legend.tsx`, `ReportModal.tsx`, `ExportModal.tsx`, `Map.tsx`, `index.html`, and `types.ts` are untouched this round, so §2P-4 still applies in full. The highest-value items for older or less technical neighbors on phones:

1. **Header height on phones** and **legend overlapping the floating bar** at 375 px width (§3.2, §3.3).
2. **Re-enable pinch zoom:** `user-scalable=no` is still in `index.html` (§3.7).
3. **Bigger tap targets** for pins and popup buttons (§3.8, §3.9).
4. **Free-text time + independently chosen time-of-day + biased defaults** (P1-3). This one affects the *quality of the evidence* handed to Atmos, not just comfort.
5. **Privacy copy:** a "everything here is public" note, a softer name placeholder, and `noindex` (§5).
6. **Date-range filter** (§4.3) and **sorting by observation time** (§4.5) for the dossier.

## 3P-4. Process note

All three rounds of fixes went directly to `main`, and `main` deploys to the link neighbors are using. This round that meant a broken `wrangler.toml` build went to production before being reverted. For the next round, I'd strongly suggest `feature/<name>` branches, as AGENTS.md says. Cloudflare Pages automatically builds a **preview URL** for each branch, which Dave can open on a phone in the Facebook app before merging.

## 3P-5. Suggested next round

1. **Fix the 3P-2.2 regression** (a few lines). Highest user-facing impact.
2. **Turnstile end to end**, in the order in 3P-2.1 (widget → deploy → secret), plus the WAF rate-limit rule.
3. **Restore `wrangler.toml` with the real D1 UUID**, on a feature branch with a preview deploy.
4. GPS preview/confirm and a tighter radius (3P-2.3).
5. The low items in 3P-2.5 and the doc corrections in 3P-2.6.
6. Then the mobile/UX/privacy pass (3P-3).

After items 1–3 I'd consider the app **ready for wide sharing**. Items 4–6 improve comfort and evidence quality, but they aren't safety or integrity issues.
