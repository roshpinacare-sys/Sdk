# @saos/fleet-sdk — the fleet's unified keyless agent SDK

**Revived T-58 (2026-10-11)** — this repo's declared graph role
(`FLEET-GRAPH.json` edge `Sdk → fleet: unified agent SDK`) is now real code.
The broadcast-archive duty below is unchanged and continues.

## What any new agent gets (zero install, zero keys, zero deps)

```js
import {
  readOfficeState, readFleetGraph, readWriteLog, readPnlDesk,
  listReceipts, readReceipt, readAnchor, verifyAnchor,
  merkleRoot, merkleProof, merkleVerify, health,
} from './sdk/index.js';

const graph = await readFleetGraph();     // one-unit canon (26 nodes / edges)
const log   = await readWriteLog();       // inter-agent write-log (JSONL)
const v     = await verifyAnchor(await readAnchor()); // independent notary check
const h     = await health();             // probe every public surface
```

Runs on `bun` or `node >= 18` (global fetch + node:crypto only). Every surface
is public-by-design: onboarding friction for a new agent drops from
"find the repos, learn the laws, wire the URLs" to one import.

## The notary bridge

`verifyAnchor()` is the keyless counterparty of saos-jummper's
`state/truthrail-anchor-latest.json`: it **recomputes** the merkle root from
the leaf list (odd-node-duplicated rule, ported from `src/jumpper/merkle.py`),
verifies every inclusion proof, and spot-checks one receipt's actual bytes
against its leaf hash. No tree, no trust, no keys — M1 (double-pass) applied
to the notary itself.

## Honest selftest

```bash
bun sdk/selftest.mjs
```

MOCKED section: deterministic merkle vectors + tamper detection (hard-fail).
LIVE section: every public surface probed for real; a red surface is recorded,
never hidden (fail-open-honest). NOTARY section: full `verifyAnchor()`.

## Workflows

`sdk-live.yml` is dispatch-ready with an honest billing note (private repo,
Actions minutes billing-walled org-wide since ~09-20 — measured). No cron on
purpose: a schedule that cannot run is noise, not autonomy. Until minutes
return, run the selftest anywhere with bun/node — it is the SDK's product.
