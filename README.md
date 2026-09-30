# Sdk — broadcast archive and document inventory

**Honest naming note (Task 11-e audit, 2026-09-30):** despite the repository
name, there is currently **no SDK code in this repo**. The actual
Identity Verification API / SDK material lives in
[`Adsmarket`](https://github.com/roshpinacare-sys/Adsmarket)
(`developers/identity-api.md`, `content/api/identity-api.md`) and the API
itself runs in the sovereign deployment. This repository holds the
**broadcast archive and document inventory** only.

## What is here

- `broadcasts/` — dated broadcast archive (29 files, 2026-09-11 → 2026-09-12).
- `docs/reports/` — historical session reports (dated snapshots).
- root `.md` files — dated broadcast copies (pulses, briefings, dossiers).
- `agent/` — the sdk-verify bot's truth report and SHA-256 manifest.

## What runs

One scheduled GitHub Action: **sdk-verify** (daily 09:23 UTC) — confirms
`docs/` and `broadcasts/` exist and are non-empty, builds a SHA-256 manifest
and counts the document inventory into `agent/status.json`.
