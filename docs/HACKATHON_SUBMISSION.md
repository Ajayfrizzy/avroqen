# NEAR Hackathon 2026 — submission rules and checklist

**Source:** included unchanged `../HACKATHON.md` as downloaded by user on 2026-10-29. The organizer says re-read live https://nearhackathon.com/HACKATHON.md before submitting; this pack cannot guarantee future changes.

## Timeline (UTC)
Begins 2026-11-01 00:00; submit by 2026-11-14 23:59; judging from November 16; results by November 18 23:59.

## Required human-supplied fields
Project name 2–80 chars, lead name 2–80, unique email up to 160, team size exact enumeration (`1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`), applicable track IDs, **mainnet** payout NEAR address, public repo URL, public X demonstration post, 20–2000 char project description, contact notice consent. Never invent or silently fill user fields.

## Relevant track IDs to evaluate only after implementation
`security` AI Security & Defense, `agents` Agent Economy, `business` Autonomous Business. Use only demonstrated fit; one submission across applicable tracks. Do not infer anything about competitor volume.

## Rules / constraints
Repository must be public by deadline; explain `do X -> see Y` to human and AI judges; X post explicitly says built at NEAR HACKATHON and contains video/screenshots. **Only one final submission**, uneditable. JSON API endpoint `POST https://nearhackathon.com/api/applications`, but do not submit automatically. Submission requires explicit preview of exact JSON and explicit human confirmation. `website` field forbidden (spam trap). Retries after 503 or network uncertainty must reuse requestId. Form at https://nearhackathon.com/#apply is alternative. Human must authorize repo publishing, pushing, mainnet actions and X posting.

## Pre-submit gates
- [ ] Owner confirms final brand/project name
- [ ] Public repo and green CI
- [ ] Working demo, true onchain receipts and clearly labeled simulation where used
- [ ] Document security assumptions and limitations, testnet vs production distinction
- [ ] README with reproducible judge instructions
- [ ] X post published by human with attached demo and working URL
- [ ] NEAR payout mainnet address confirmed by owner
- [ ] Confirm tracks and exact field validation; no unintended data in submission
- [ ] Display final JSON, obtain explicit final approval; submit only once
- [ ] Store submission receipt/status locally outside repo; don't publish sensitive payload
