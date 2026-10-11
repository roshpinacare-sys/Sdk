// @saos/fleet-sdk — the fleet's unified keyless agent SDK (T-58 revival, FLEET-GRAPH edge Sdk→fleet).
//
// WHAT: one module that gives any new agent instant, keyless access to the
// fleet's public truth surfaces. Zero dependencies (global fetch + node:crypto).
// Zero secrets: every surface here is PUBLIC BY DESIGN (TruthRail doctrine —
// receipts are verifiable without trusting anyone).
//
// SURFACES (all keyless):
//   readOfficeState()  — Domain/office/data.json   (office pulse, 2h cadence)
//   readFleetGraph()   — FleetHQ GOVERNANCE/FLEET-GRAPH.json (one-unit canon)
//   readWriteLog()     — FleetHQ GOVERNANCE/write-log.jsonl  (inter-agent law)
//   readPnlDesk()      — Domain/dex/pnl-desk.json   (T2 economic verdict)
//   listReceipts()     — TruthRail receipts/ index  (fleet receipts channel)
//   readReceipt(name)  — one TruthRail receipt
//   readAnchor()       — saos-jummper truthrail-anchor-latest.json (merkle notary)
//   verifyAnchor(a)    — INDEPENDENT re-verification of the notary anchor:
//                        recomputes the merkle root from the leaf list, checks
//                        every inclusion proof, spot-checks one receipt's bytes
//                        against its leaf hash. Standalone: no tree, no trust.
//   health()           — probe every surface once, return ok/latency map.
//
// LAWS honored: fail-open-honest (a red probe is a fact, never hidden);
// additive-first; no secrets anywhere; runs on bun or node >= 18.

import { createHash } from 'node:crypto';

export const FLEET = {
  owner: 'roshpinacare-sys',
  officeState: 'https://roshpinacare-sys.github.io/Domain/office/data.json',
  fleetGraph: 'https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/GOVERNANCE/FLEET-GRAPH.json',
  writeLog: 'https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/GOVERNANCE/write-log.jsonl',
  pnlDesk: 'https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/dex/pnl-desk.json',
  receiptsIndex: 'https://api.github.com/repos/roshpinacare-sys/TruthRail/contents/receipts',
  receiptRaw: (name) => `https://raw.githubusercontent.com/roshpinacare-sys/TruthRail/main/receipts/${encodeURIComponent(name)}`,
  anchor: 'https://raw.githubusercontent.com/roshpinacare-sys/TruthRail/main/anchors/truthrail-anchor-latest.json',
};

// raw.githubusercontent caches misses (~5min) — bust it for fresh pushes (T-58).
const bust = (url) => `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const cat = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };

async function fetchBytes(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15000), headers: { 'User-Agent': 'saos-fleet-sdk/1.0 (keyless)' } });
  return { ok: r.ok, status: r.status, body: r.ok ? await r.arrayBuffer() : null };
}
const b64ToText = (b64) => Buffer.from(b64, 'base64').toString('utf-8');

// Keyless fetch with fallback chain: raw.githubusercontent → cdn.jsdelivr.net →
// api.github.com contents (unauth, base64). Rationale (measured T-58): raw CDN
// has propagation lag for freshly-pushed files; jsDelivr mirrors public GitHub
// repos keyless and propagates fast; the unauth API is the last resort
// (60 req/h per IP). The SDK must work from ANYwhere, not just a warm cache.
function variantsFor(url) {
  const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/)?(main|master)\/(.+)$/);
  if (!m) return [url];
  const [, owner, repo, br, path] = m;
  return [
    url,
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${br}/${path}`,
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${br}`,
  ];
}
async function keylessText(url, opts = {}) {
  const vs = variantsFor(url);
  let lastErr = null;
  for (let i = 0; i < vs.length; i++) {
    const { ok, status, body } = await fetchBytes(vs[i], opts);
    if (ok) {
      if (i === 2) {
        const j = JSON.parse(Buffer.from(body).toString('utf-8'));
        if (j.content) return b64ToText(j.content);
        lastErr = new Error(`contents api: ${j.message ?? 'no content'}`);
      } else return Buffer.from(body).toString('utf-8');
    } else lastErr = new Error(`HTTP ${status} for ${vs[i].slice(0, 90)}`);
  }
  throw lastErr ?? new Error(`all keyless variants failed for ${url.slice(0, 90)}`);
}

async function getJSON(url, opts = {}) {
  return JSON.parse(await keylessText(url, opts));
}
async function getText(url, opts = {}) {
  return keylessText(url, opts);
}

// ── Merkle (port of saos-jummper src/jumpper/merkle.py — odd node DUPLICATED,
//    not self-hashed; proofs carry explicit direction; verify is standalone).
export function hashPair(left, right) {
  if (left.length !== 64 || right.length !== 64) throw new Error('hashPair expects two 64-char hex digests');
  return sha256Hex(cat(fromHex(left), fromHex(right)));
}
export function merkleRoot(leaves) {
  if (!leaves.length) throw new Error('cannot build a Merkle tree from zero leaves');
  let cur = [...leaves];
  while (cur.length > 1) {
    const nxt = [];
    for (let i = 0; i + 1 < cur.length; i += 2) nxt.push(hashPair(cur[i], cur[i + 1]));
    if (cur.length % 2 === 1) nxt.push(cur[cur.length - 1]);
    cur = nxt;
  }
  return cur[0];
}
export function merkleProof(leaves, index) {
  if (index < 0 || index >= leaves.length) throw new Error(`index ${index} out of range`);
  const levels = [[...leaves]];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1], nxt = [];
    for (let i = 0; i + 1 < cur.length; i += 2) nxt.push(hashPair(cur[i], cur[i + 1]));
    if (cur.length % 2 === 1) nxt.push(cur[cur.length - 1]);
    levels.push(nxt);
  }
  const path = [];
  let idx = index;
  for (const level of levels.slice(0, -1)) {
    if (idx % 2 === 0) { if (idx + 1 < level.length) path.push({ sibling: level[idx + 1], dir: 'right' }); }
    else path.push({ sibling: level[idx - 1], dir: 'left' });
    idx = Math.floor(idx / 2);
  }
  return path;
}
export function merkleVerify(leaf, path, expectedRoot) {
  if (leaf.length !== 64 || expectedRoot.length !== 64) return false;
  let cur = leaf;
  try {
    for (const step of path) {
      const { sibling, dir } = step;
      if (sibling.length !== 64 || !['left', 'right'].includes(dir)) return false;
      cur = dir === 'left' ? hashPair(sibling, cur) : hashPair(cur, sibling);
    }
  } catch { return false; }
  return cur === expectedRoot;
}

// ── Surface readers (all keyless) ────────────────────────────────────────────
export const readOfficeState = () => getJSON(bust(FLEET.officeState));
export const readFleetGraph = () => getJSON(bust(FLEET.fleetGraph));
export async function readWriteLog() {
  const text = await getText(bust(FLEET.writeLog));
  return text.trim().split('\n').map((l) => JSON.parse(l));
}
export const readPnlDesk = () => getJSON(bust(FLEET.pnlDesk));
export async function listReceipts() {
  try {
    const arr = await getJSON(FLEET.receiptsIndex);
    if (!Array.isArray(arr)) throw new Error('receipts index is not a list');
    return arr.map((x) => ({ name: x.name, size: x.size }));
  } catch (e) {
    // Rate-limited or blocked → keyless fallback: jsDelivr's flat file tree.
    const r = await fetch('https://data.jsdelivr.com/v1/packages/gh/roshpinacare-sys/TruthRail@main?structure=flat', { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'saos-fleet-sdk/1.0 (keyless)' } });
    if (!r.ok) throw new Error(`receipts index failed both paths: ${String(e.message).slice(0, 60)} + jsdelivr HTTP ${r.status}`);
    const tree = await r.json();
    return (tree.files ?? []).filter((f) => f.name.startsWith('/receipts/') && f.name.endsWith('.json'))
      .map((f) => ({ name: f.name.replace('/receipts/', ''), size: f.size }));
  }
}
export const readReceipt = (name) => getJSON(bust(FLEET.receiptRaw(name)));
export const readAnchor = () => getJSON(bust(FLEET.anchor));

// ── Independent anchor verification (the SDK's crown jewel) ──────────────────
// Recompute the root from the leaf list; verify every inclusion proof; fetch
// ONE receipt's actual bytes and check its sha256 equals its leaf. If ANY step
// fails → { ok:false, errors[] }. Honest by construction.
export async function verifyAnchor(anchor) {
  const errors = [];
  const leafHashes = (anchor.leaves ?? []).map((l) => l.sha256);
  if (!leafHashes.length) errors.push('anchor has no leaves');
  let recomputed = null;
  try { recomputed = merkleRoot(leafHashes); } catch (e) { errors.push(`root recompute: ${e.message}`); }
  if (recomputed && recomputed !== anchor.root) errors.push(`root mismatch: recomputed=${recomputed} declared=${anchor.root}`);
  const proofs = anchor.proofs ?? [];
  const proofResults = proofs.map((p) => ({ path: p.path, ok: merkleVerify(p.leaf, p.proof, anchor.root) }));
  for (const pr of proofResults) if (!pr.ok) errors.push(`proof failed for ${pr.path}`);
  if (leafHashes.length && !proofs.length) errors.push('no inclusion proofs included (must include >=1)');
  let spot = null;
  if (leafHashes.length) {
    try {
      const idx = proofs.length ? leavesIndexOf(anchor, proofs[0].path) : 0;
      const receipt = await getText(bust(FLEET.receiptRaw(anchor.leaves[idx].path)));
      const actual = sha256Hex(new TextEncoder().encode(receipt));
      spot = { path: anchor.leaves[idx].path, match: actual === anchor.leaves[idx].sha256 };
      if (!spot.match) errors.push(`spot-check bytes mismatch for ${spot.path}`);
    } catch (e) { errors.push(`spot-check fetch: ${e.message}`); }
  }
  return { ok: errors.length === 0, root: anchor.root, recomputedRoot: recomputed, receipts: leafHashes.length, proofs: proofResults, spot, errors };
}
function leavesIndexOf(anchor, path) {
  const i = anchor.leaves.findIndex((l) => l.path === path);
  return i >= 0 ? i : 0;
}

// ── Health probe (one call per surface) ──────────────────────────────────────
export async function health() {
  const probes = {
    officeState: () => readOfficeState(),
    fleetGraph: () => readFleetGraph(),
    writeLog: () => readWriteLog(),
    pnlDesk: () => readPnlDesk(),
    receiptsIndex: () => listReceipts(),
    anchor: () => readAnchor(),
  };
  const out = {};
  for (const [name, fn] of Object.entries(probes)) {
    const t0 = Date.now();
    try { const v = await fn(); out[name] = { ok: true, ms: Date.now() - t0, shape: Array.isArray(v) ? `list(${v.length})` : typeof v }; }
    catch (e) { out[name] = { ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 120) }; }
  }
  return out;
}
