# Codex review — Neighborhood Gas Map

**Review date:** October 20, 2026  
**Scope:** Code review of the React client and Cloudflare Pages Function; build verification.  
**Verdict:** The reporting flow is unusually complete for an initial build: the map, safety reminder, structured report form, owned-pin recovery controls, and HOA/Atmos export all support the product goal well. It should not yet be promoted as a broadly public, authoritative community log. The write API currently lets any visitor alter the shared record and renders untrusted report content as HTML.

## Verification performed

- Read the project guidance, product decisions, client code, Pages Function, and deployment-related files.
- Ran `npm run build` successfully on October 20, 2026. TypeScript compilation and Vite production build completed with zero errors. The emitted JavaScript bundle is 419.51 kB uncompressed / 126.24 kB gzip.
- Confirmed there is no configured automated test command, test framework, or versioned Cloudflare/Wrangler binding configuration in the repository.
- Reviewed the listed Pages deployment URL and API URL, but the external inspection tool could not reach either URL. Live-browser and Cloudflare-dashboard validation remain needed.

## Release blockers

### P0 — Any visitor can delete or alter every community report

`functions/api/reports.ts` accepts `PUT` for any supplied `id` and deletes any `id` in a query parameter. Neither endpoint authenticates the caller nor checks ownership. The browser's `neighborhood_my_report_ids_v1` list is only a convenience feature: it is not trusted or visible to the server. Worse, **View All** shows a delete icon for every report, not only device-owned reports.

Impact: a visitor (or scripted request) can remove, move, or rewrite the entire dossier. That would make the app unreliable exactly when it is meant to provide evidence to Atmos or the HOA.

Recommendation: before public sharing, choose a real moderation/ownership model. The safest short-term version is append-only community reports plus a separate authenticated admin/moderation endpoint. If contributor self-edit/delete is essential, issue an opaque, per-report edit capability when a report is created; store only a hash server-side and require it for subsequent changes. Do not treat a localStorage ID as authorization. Restrict the list-modal delete control to a properly authorized action.

### P0 — Stored cross-site scripting in map popups

`src/components/Map.tsx` builds `popupHtml` using report values (notably `notes`, `reportedBy`, and `windDirection`) and assigns it to `popupDiv.innerHTML`. The API accepts arbitrary values for those fields. A malicious report can therefore inject HTML and event-handler JavaScript that runs when a neighbor opens its pin.

Impact: attacker-controlled code can impersonate the app, change displayed data, issue same-origin API requests, or lead visitors to a fraudulent safety message. This combines especially badly with the unauthenticated write endpoints above.

Recommendation: construct popup content with DOM nodes and `textContent`, or render it through React into the Leaflet popup. Do not interpolate user-provided text into HTML strings. Server-side schema validation and field-length limits are still necessary, but escaping at the rendering boundary is mandatory.

### P0 — No server-side schema, geographic bounds, size limits, or abuse controls

The POST handler checks only that `lat` and `lng` are numbers. It accepts invalid/out-of-area coordinates, arbitrary enum values and dates, duplicate/attacker-chosen IDs, giant notes, and arbitrary additional properties. There is also no rate limiting, bot protection, or abuse reporting/moderation path. Each write rewrites the one shared KV document.

Impact: public map vandalism, misleading locations, oversized/expensive KV usage, and trivial automated spam are all possible. Natural-gas reports are safety-adjacent data, so data quality matters more than with an ordinary guestbook.

Recommendation: validate a defined request schema on every method: finite latitude/longitude constrained to an intentionally selected neighborhood bounding box; allowed enum values; ISO date; constrained time format; maximum lengths; required nonempty notes if desired; and a generated server-side ID/timestamp. Reject unknown fields. Add Cloudflare-side rate limiting and an abuse-control decision before public launch; Turnstile plus an IP-based rate limit is a practical baseline, but it should not be the only integrity control.

## High-priority findings

### P1 — Whole-list KV read/modify/write will lose concurrent submissions

Every create, update, and delete reads `all_gas_reports`, edits the array, and writes the full value back. Two nearly simultaneous submissions can both read the same old array and the later write overwrites the earlier one. KV is also eventually consistent, which makes this pattern unsuitable as the source of truth for a collaborative log.

Recommendation: store each report under its own key and keep an index designed for the expected query pattern, or move collaborative writes to a Durable Object/D1 service that serializes mutations. Include a test that submits two reports concurrently and confirms neither disappears.

### P1 — Missing KV binding causes a misleading “successful” shared submission

Without `GAS_REPORTS_KV`, POST returns `201` with the submitted object but persists nothing. GET returns `200 []`; the client silently substitutes its local seed data. Each visitor then has a different local map, while the UI makes it look shared. The repository contains no versioned binding/deployment config to guard against this condition.

Recommendation: treat an absent production binding as a visible configuration error (and a non-2xx response), not a successful submission. Keep local-only mode explicit and labelled for development. Add a versioned Cloudflare configuration/deployment checklist that binds the KV namespace and a post-deploy health check that creates, reads, then deletes a test report in a non-production environment.

### P1 — Update/delete report success even when no shared mutation occurred

PUT returns `200` and echoes the request body if its ID is absent, and DELETE returns success even if there is no KV record. The client then presents the local state as saved. A report can consequently look edited or removed on one device but remain unchanged for everyone else.

Recommendation: return `404` for a nonexistent ID, distinguish persistence failures from successful mutations, and leave local UI unchanged (with a clear retry message) when the shared write fails.

### P1 — Public exact locations and reporter identities need an explicit privacy policy

Reports disclose precise household-level coordinates, free-text landmarks, and optional names/streets. The CSV makes all of that one-click exportable. This might be acceptable for a private neighborhood link, but it is not currently framed as a consent decision nor does it offer a coarse-location option or data-retention/deletion policy.

Recommendation: decide and document who can see/export reports, how long they are retained, and who may remove them. Default public pins to a small coordinate grid or allow “approximate location,” discourage full names/addresses, and show concise consent language above submission. For an externally shared app, a link to the privacy/data-use terms is warranted.

### P1 — CSV export permits spreadsheet formula injection

The CSV quote-escapes quotes but does not neutralize fields beginning with `=`, `+`, `-`, or `@`. A malicious note or reporter name can become a spreadsheet formula when an HOA member opens the export in Excel or Sheets.

Recommendation: prefix a leading apostrophe for every string cell whose first non-whitespace character is one of those values, then CSV-escape it. Test values such as `=HYPERLINK(...)`, `+1+1`, and multiline notes.

## Product and usability findings

### P2 — “Report Smell” defaults to a fixed neighborhood coordinate

When a visitor uses the header/floating action rather than taps the map, the form declares a pin location but defaults it to `[33.03505, -97.04638]`. It is very easy to submit a report at that unrelated fixed point. The tap-map flow is better, but the primary button should not silently select a location.

Recommendation: open an explicit location-selection state first (for example, “Tap the map to place your pin”), allow a confirmable draggable preview, and reserve the default coordinate for initial map centering only.

### P2 — Filter state promises more than the UI implements

`FilterState` contains intensity and date filters, but the header offers only time-of-day filters and the filtered report calculation ignores `intensity` and `date`. The count badge shows the filtered count, whereas export and View All use all reports. This is likely to confuse a person trying to describe the current evidence set.

Recommendation: either implement intensity/date controls and apply them consistently, or remove the unused state. Clearly label whether export uses all records or the currently filtered view; offering both is useful for a field dossier.

### P2 — Accessibility needs a focused pass

The time-of-day selection uses clickable `div` elements rather than buttons/radio inputs, so it is not keyboard operable or announced as a choice group. The dialogs lack `role="dialog"`, `aria-modal`, accessible close labels, focus management, and Escape handling. The icon-only delete controls in the report list depend on visual title text.

Recommendation: use native radio controls/buttons for selection, implement a focus-trapped dialog with focus returned to its trigger, support Escape, and give every icon-only action an `aria-label`. Test with keyboard-only navigation and a screen reader before sharing.

### P2 — Data quality could improve with small form changes

“Approx. Time” is free-form but drives a fixed time-of-day color. A user can enter `8 PM` while leaving Morning selected. Notes and identity fields have no visible character guidance, and the app does not show an acknowledgement that reports are observations rather than confirmed leaks.

Recommendation: derive the bucket from a `time` input when a specific time is known, or retain explicit “approximate period” as the only time entry. Add character limits/counters and a compact statement such as “This map records neighbor observations; it does not verify a gas leak.” Keep the existing emergency guidance prominent.

## Engineering and operational improvements

- Add focused unit tests for API validation/authentication, CSV escaping, form defaults, filter behavior, and data transformations; add an end-to-end path for create → reload → edit/delete as authorized → export.
- Add an integration test against a test binding and failure-path tests for missing KV/network errors. Current `npm run build` gives valuable type/build coverage but no behavioral coverage.
- Version the Cloudflare Pages/KV setup or document it in a deploy runbook. The repository currently cannot prove which KV namespace is bound in production.
- Add telemetry that records server errors and rejected input without collecting unnecessary identity/location data; avoid logging full report bodies in production.
- Clarify retention and add an admin review/soft-delete/audit trail. A hard delete is weak evidence management for a dossier, even once authorization exists.
- Consider whether the 200-report cap is compatible with the investigation timeline. If retained, show users that older reports can age out; a per-report store avoids quietly losing historical evidence.
- Audit external tile-provider terms, attribution, and expected volume before broad public promotion. This is low risk at neighborhood scale but worth making intentional.

## Suggested release sequence

1. Address the three P0 findings before sharing beyond a tightly controlled test group.
2. Make persistence fail closed and verify the real Cloudflare binding in a test environment.
3. Decide privacy, retention, moderation, and edit-ownership rules; implement them with server enforcement.
4. Add the small location/filter/accessibility corrections, then run mobile Safari/Chrome, desktop keyboard, and live Pages smoke tests.
5. Do a short trial with known neighbors, export the resulting dossier, and confirm Atmos/HOA recipients can use the format without exposing data they should not receive.

## Strengths worth retaining

- The safety callout appears before the reporting UI and uses a tap-to-call number.
- The structured fields (observation date/time, intensity, odor type, wind, and notes) are much more useful for field investigation than a simple pin drop.
- The map-first flow, compact time-color legend, satellite toggle, and mobile bottom actions are well aligned with use in the neighborhood.
- The immediate undo and move-pin flow is a good response to the most likely mobile reporting error.
- The export summary and CSV provide a strong bridge from community observations to a practical HOA/utility handoff once data integrity is protected.

## Second pass — October 20, 2026

**Scope:** Re-review of the hardening work through current `main` (including commits `c12e185`, `1e4a8ac`, and `6d95b38`), plus a fresh `npm run build`.

**Second-pass verdict:** The core release blockers from the first review have been materially addressed in the D1-backed production path. In particular, arbitrary shared-record edit/delete and stored popup XSS are no longer present in that path. The fresh production build again passes with zero TypeScript/Vite errors. I would classify the app as suitable for a small, known-neighbor pilot after the remaining P1 items below are resolved or explicitly accepted; I would not yet describe the write endpoint as fully hardened for broad public distribution.

### Verified resolutions from the first pass

- **P0 ownership bypass — resolved in the D1 path.** Creates generate a UUID edit token, the server stores only its SHA-256 hash, and D1-backed PUT/DELETE require the matching `X-Edit-Token` (or an admin key). Missing records now return `404`; invalid/missing tokens return `403`. The report-list delete button is also now shown only for reports whose local device holds a token.
- **P0 stored XSS — resolved.** `Map.tsx` no longer interpolates report text into popup `innerHTML`. The popup is built with DOM nodes and `textContent`, including notes, reporter, wind direction, date, and time.
- **P1 concurrent whole-list persistence — resolved in the intended production path.** Each report is now a D1 row rather than an element in a read/modify/write KV array. Soft deletes preserve an audit record. `schema.sql` includes useful active/date indexes.
- **P1 false success for a missing D1 report — resolved.** D1 PUT and DELETE find the active record first and return a real `404` when absent. The client treats non-2xx responses as failures rather than silently presenting them as saved.
- **P1 CSV formula injection — resolved.** The exporter prefixes cells beginning with spreadsheet formula triggers and now generates a UTF-8-BOM Blob download rather than a data URI.
- **Fixed-coordinate report entry — resolved.** The primary report action enters an explicit “Tap map where you smelled it” placement mode and offers opt-in browser GPS, instead of silently assigning a fixed neighborhood coordinate.
- **Operational improvements verified:** seed data is removed, local calendar date generation avoids the prior UTC rollover, popup-dismiss clicks are guarded, and draggable marker handling no longer rebuilds the layer mid-drag.

### Remaining findings

#### P1 — Update requests bypass the validation added to POST

POST now constrains coordinates and truncates some strings, but the D1 PUT handler accepts replacement `lat`, `lng`, `timeOfDay`, `intensity`, `smellType`, `windCondition`, `observedDate`, and `observedTime` without validating ranges, allowed values, date format, or coordinate finiteness. A legitimate report owner—or someone with a stolen edit token—can update a record to invalid enums, impossible coordinates, or malformed dates. The POST coordinate validation is global Earth bounds only, so neither method confines pins to the intended neighborhood.

Recommendation: extract one shared server-side parser/validator and use it for both create and update. Reject non-finite coordinates and enforce an intentionally chosen Flower Mound/neighborhood bounding box; validate all enums and a strict `YYYY-MM-DD` date; constrain time and every text field. Do not rely on TypeScript client types as a boundary.

#### P1 — Turnstile is optional even when its secret is configured, and no widget supplies a token

The server verifies Turnstile only when **both** `TURNSTILE_SECRET_KEY` and `body.turnstileToken` are present. If the secret is bound but an attacker simply omits `turnstileToken`, the request proceeds. The reviewed client has no Turnstile widget/integration that obtains and passes a real token (the optional API parameter exists but `App.tsx` does not provide one).

Recommendation: once Turnstile is enabled, require a nonempty token and fail closed on missing, invalid, or verification-error responses. Add the client widget using the matching public site key, pass the token to `submitReport`, reset it after each attempt, and add Cloudflare rate limiting as a separate control. Until then, describe the app as having no effective bot gate rather than relying on this code path.

#### P1 — KV fallback retains the old insecure semantics

Production is documented as D1-bound, but the retained KV fallback does not verify edit tokens on PUT/DELETE, permits arbitrary merge fields, uses the old whole-list overwrite pattern, and returns a successful echo on a missing report. If D1 is accidentally unbound or a future environment binds only KV, the original integrity vulnerabilities return.

Recommendation: either remove the fallback and fail closed when D1 is unavailable, or bring its authorization, validation, conflict behavior, and retention semantics up to parity. A storage configuration must not lower the security model.

#### P2 — The live D1 deployment claim was not independently exercised in this review

`STATUS.md` records a successful live D1 read/write/delete probe, which is encouraging. The external inspection channel available for this review still could not reach the Pages URL/API, so I could not independently confirm the active binding or exercise the deployed endpoint. This is a verification limitation, not evidence that the claim is false.

Recommendation: retain an operator-run, non-production health-check procedure that proves: D1 is bound; a create returns an edit token; unauthenticated update/delete return `403`; authorized update/delete succeed; and a malformed/spam request is rejected. Do not run that probe against the public production evidence log unless its test data is reliably isolated or purged through the audit process.

#### P2 — Original privacy, retention, accessibility, and filter concerns remain mostly open

The changes correctly remove fake seeds and improve placement safety, but the app still exposes exact coordinates and optional identity/free-text data to every visitor and offers an all-record export. There is no visible consent/data-retention policy in the reviewed UI. The time-of-day picker remains a clickable `div` rather than a keyboard-operable radio/button control; dialogs still lack dialog semantics, focus trapping, Escape handling, and labelled close buttons. `FilterState` still includes date/intensity state while the visible header only exposes time-of-day, and filtering still does not apply a date.

Recommendation: make an explicit product decision on public precision, retention, and export audience before broad sharing; then add concise submission disclosure. Follow with the focused accessibility/filter cleanup described in the first-pass review.

### Second-pass test record

- `npm run build`: **PASS** — clean TypeScript compilation and Vite production build; generated JavaScript is 421.86 kB / 126.77 kB gzip.
- Source review of D1 create/read/update/delete, client edit-token transport, popup rendering, CSV export, explicit pin placement, schema, and Git history: **PASS with the exceptions recorded above**.
- Automated unit/integration/end-to-end tests: **not present**.
- Independent live Pages/D1 request test: **not completed** because the available external inspection channel could not access the deployment URL.
