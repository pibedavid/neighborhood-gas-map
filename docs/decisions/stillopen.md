# Still Open Decisions & Questions
**Location:** `docs/decisions/stillopen.md`  
**Last Updated:** October 20, 2026  

---

## Active Questions

1. **Subdomain Choice:**
   - **Settled:** Dave decided NOT to publish under personal domain `galindo.co`. It will be deployed directly to a clean Cloudflare Pages subdomain (e.g. `neighborhood-gas-map.pages.dev`).

2. **Atmos Direct Hotline Callout:**
   - Include prominent emergency banner at top: *"If you smell strong gas near your meter or home right now, call Atmos Energy immediately at 866-322-8667 or 911."*
   - *Status:* Settled in principle; adding to header banner.

3. **Data Moderation / Admin Delete:**
   - Do we need an admin password to hide or delete test/bogus pins?
   - *Proposal:* Include lightweight admin passcode for pin deletion if needed.
