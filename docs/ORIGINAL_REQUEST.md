# ORIGINAL_REQUEST.md — Genesis Brief & Context for Peer Review

**Date:** October 20, 2026  
**Product Owner:** Dave Galindo (`pibedavid`)  
**Target Reviewers:** Claude Code (`Lead Builder`) & Codex (`Security Auditor & Critic`)  
**Project:** `neighborhood-gas-map`  
**Location:** `C:\Dev\neighborhood-gas-map\docs\ORIGINAL_REQUEST.md`  

---

## 1. Background & The Genesis Event

Over the past two weeks in October 2026, a faint, intermittent natural gas odor began appearing outdoors around the neighborhood common area in Flower Mound, TX (specifically around Golden Aspen Dr, Rosewood Trail, and the community pond/bridge).

Dave called Atmos Energy for a safety inspection. An Atmos technician inspected Dave's house meter and property perimeter; all gas sensor readings were completely normal. The technician hypothesized that recent rapid temperature swings might cause pressure relief valves to occasionally vent small puffs of gas. 

However, neighbors walking the trail between Golden Aspen Dr and the pond began independently reporting smelling natural gas both near the street and on the far side of the pond. Dave also detected a distinct odor coming across the wooden bridge over the pond spillway. 

Because the odor is appearing across multiple separate points around common areas rather than a single residential meter, it indicates a potential easement line, main line, or drainage pocket issue that requires HOA coordination and an Atmos Energy field investigation.

---

## 2. Dave's Community Facebook Post

To gather data from neighbors before contacting the HOA and looping Atmos back out for a broader look, Dave posted the following in the neighborhood Facebook group:

> *"Has anyone else caught a random natural gas smell near the pond / bridge lately?*
> 
> *Hey neighbors,*  
> *Quick check-in to see if anyone else has been catching the occasional natural gas smell outdoors around the pond area.*  
> 
> *We live on Golden Aspen Dr (the corner house closest to where the upcoming Halloween parade kicks off). Over the past week or two, we’ve noticed the smell faintly outside our place every now and then. We had an Atmos tech come out to be safe; by the time he arrived, the smell had cleared up, and all his sensors read completely normal around our meter and perimeter. He mentioned quick temperature swings can sometimes make a pressure relief valve vent a tiny puff, but it seemed to keep popping up.*  
> 
> *Today, a neighbor walking the path between our house and the pond mentioned smelling it both by us and over near the houses on the far side of the pond. I also caught a distinct whiff coming across the bridge the other night.*  
> 
> *Since it’s popping up across different spots around the water and trail, it might be an easement line, main line, or drainage pocket rather than an individual house meter. Before contacting the HOA and looping Atmos back out for a broader look along the common areas, I wanted to ask the hive mind:*  
> 
> *Have you smelled it along Golden Aspen, the bridge, or anywhere along the pond path?*  
> *If you did, roughly what time or spot did you notice it?*  
> 
> *Drop a comment if you’ve run across it so we can give the HOA and Atmos clear location markers to check. (And of course, if anyone ever smells it concentrated or strongly near their own home, definitely call Atmos directly right away).*  
> 
> *Thanks, everyone!"*

Multiple neighbors responded confirming they had smelled natural gas at various times of day in different spots.

---

## 3. Product Vision & Requirements

Dave's goal was to provide an interactive map where neighbors could drop pins indicating where and when they smelled gas.

### Core Requirements:
1. **Zero Barrier to Entry:**
   - Most neighbors click links from mobile phones inside Facebook's in-app browser.
   - **No account login, no Google sign-in, no app download required.**
   - Simple, frictionless tap-to-pin interface.
2. **Time-of-Day Categorization:**
   - Natural gas venting / atmospheric pooling strongly correlates with temperature and time of day.
   - Pins must visually distinguish time of day:
     - 🌅 Morning (6 AM – 12 PM)
     - ☀️ Afternoon (12 PM – 6 PM)
     - 🌆 Evening (6 PM – 10 PM)
     - 🌙 Night (10 PM – 6 AM)
3. **Structured Sighting Attributes:**
   - Date & Approximate Time
   - Intensity: Faint Whiff, Noticeable, Strong / Acrid (Strong gets an animated radar pulse)
   - Odor Type: Mercaptan (Rotten Egg), Sulfur, Chemical, Other
   - Wind / Air flow conditions
   - Specific location notes & optional reporter name/street
4. **Actionable HOA & Atmos Energy Dossier:**
   - One-click tool generating a structured incident report.
   - Includes CSV download with exact GPS coordinates, timestamps, and notes.
   - Formatted text summary ready to copy-paste into an email to HOA management or Atmos dispatch.
5. **Prominent Safety First Banner:**
   - Direct Atmos Emergency hotline (`866-322-8667`) and 911 warning for immediate indoor/meter emergencies.

---

## 4. Key Design Decisions & Refinements (Settled in Session)

1. **Mapping Engine:**
   - Leaflet.js with free OpenStreetMap tiles and Esri World Imagery satellite aerial tiles.
   - **Explicit rejection of Google Maps API:** Avoids billing accounts, API keys, quota caps, and credit card exposure.
2. **Marker Styling (Refined):**
   - Compact **16px circular dots** with crisp white borders (`2px solid #ffffff`) and subtle drop shadows, styled after Google Maps' mobile location dot.
   - **No internal icons or emojis inside map dots** to eliminate visual clutter.
   - **High-contrast 4-color palette:**
     - Morning: Bright Amber / Yellow (`#eab308`)
     - Afternoon: Vivid Sky Blue (`#0284c7`)
     - Evening: Crimson / Rose Red (`#e11d48`)
     - Night: Deep Violet / Purple (`#7c3aed`)
3. **Map Viewport Alignment:**
   - Centered at `[33.0352, -97.0482]` with `zoom: 16.6` (`zoomSnap: 0.1`).
   - Frames the entire neighborhood: west-side homes (Maple Grove Dr, Cedar Bluff Ln, Lofty Pines, Redwood Crest) all the way across to the pond, bridge, and Golden Aspen Dr.
   - Removed artificial landmark labels to keep the aerial and street view clean.
4. **Hosting & Deployment Boundary:**
   - **Deployed as a standalone Cloudflare Pages site** (e.g. `*.pages.dev`).
   - **Explicit decision NOT to publish under personal domain `galindo.co`**, keeping the neighborhood civic tool separate from personal household infrastructure.
5. **Backend & Persistence:**
   - Cloudflare Pages Function at `functions/api/reports.ts`.
   - Production persistence via Cloudflare KV (`GAS_REPORTS_KV`).
   - Automatic graceful client fallback to `localStorage` in dev and preview environments.

---

## 5. Review Directives for Claude Code & Codex

We request an independent review focusing on:
1. **Adversarial / Spam Mitigation (Codex):**
   - Since the app is anonymous and public, evaluate protections against spam pins or accidental coordinate spamming, without introducing high-friction captchas that deter non-technical neighbors.
2. **Edge Concurrency & KV Limits (Codex / CC):**
   - Review `/api/reports.ts` for Cloudflare KV read/write characteristics and cap limits.
3. **Mobile & In-App Browser Experience (CC):**
   - Inspect Leaflet touch interaction on mobile devices, especially when opened inside Facebook's in-app webview.
4. **Data Hygiene & Privacy (Codex):**
   - Verify that optional reporter names/notes do not leak sensitive personal data.
