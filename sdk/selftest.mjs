// selftest.mjs — @saos/fleet-sdk live selftest (T-58).
//
// Two sections, both honest:
//   MOCKED  — deterministic merkle vectors + tamper detection (no network).
//             ANY failure here = hard fail (the math must never drift).
//   LIVE    — every public surface, probed for real, right now. A red surface
//             is a recorded FACT (fail-open-honest), not a fake success.
//             Exit 0 requires: all mocked pass, >=1 live surface ok, and —
//             if the notary anchor exists — full independent verifyAnchor() ok.
//
// Usage:  bun sdk/selftest.mjs   (or: node sdk/selftest.mjs)
import { merkleRoot, merkleProof, merkleVerify, verifyAnchor, readAnchor, health, FLEET } from './index.js';

let fails = 0, passes = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passes++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fails++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

console.log('== MOCKED (deterministic, no network) ==');
{
  // Golden cross-check vs jummper's odd-duplicate rule: leaves = ["aa"*32, "bb"*32, "cc"*32]
  const L = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const root = merkleRoot(L);
  check('merkleRoot deterministic', /^[0-9a-f]{64}$/.test(root), root.slice(0, 12) + '…');
  // odd node duplicated: level1 = [H(a,b), c] → root = H(H(a,b), c)
  const { createHash } = await import('node:crypto');
  const hp = (l, r) => createHash('sha256').update(Buffer.concat([Buffer.from(l, 'hex'), Buffer.from(r, 'hex')])).digest('hex');
  check('odd-node duplicated (not self-hashed)', root === hp(hp(L[0], L[1]), L[2]));
  // inclusion proofs for all 3 indices verify
  for (let i = 0; i < 3; i++) check(`proof[${i}] verifies`, merkleVerify(L[i], merkleProof(L, i), root));
  // tamper detection: wrong leaf, wrong sibling, wrong root
  check('tampered leaf rejected', !merkleVerify('f'.repeat(64), merkleProof(L, 0), root));
  check('tampered root rejected', !merkleVerify(L[0], merkleProof(L, 0), 'e'.repeat(64)));
  check('tampered sibling rejected', !merkleVerify(L[0], merkleProof(L, 0).map(s => ({ ...s, sibling: 'd'.repeat(64) })), root));
  // 5-leaf tree (two odd levels) — all proofs verify
  const L5 = [...L, 'd'.repeat(64), 'e'.repeat(64)];
  const r5 = merkleRoot(L5);
  for (let i = 0; i < 5; i++) check(`5-leaf proof[${i}] verifies`, merkleVerify(L5[i], merkleProof(L5, i), r5));
}

console.log('== LIVE (public fleet surfaces, probed now) ==');
const h = await health();
let liveOk = 0;
for (const [surface, r] of Object.entries(h)) {
  check(`surface ${surface}`, r.ok, r.ok ? `${r.ms}ms ${r.shape}` : r.error);
  if (r.ok) liveOk++;
}
check('at least one live surface', liveOk >= 1, `${liveOk}/6 ok (a red surface is a fact, not hidden)`);

console.log('== NOTARY (independent anchor verification) ==');
let anchorOk = false;
try {
  const anchor = await readAnchor();
  const v = await verifyAnchor(anchor);
  anchorOk = v.ok;
  check('verifyAnchor (root recompute + proofs + bytes spot-check)', v.ok,
    v.ok ? `root=${v.root.slice(0, 12)}… receipts=${v.receipts} proofs=${v.proofs.length}/${v.proofs.filter(p => p.ok).length} spot=${v.spot?.match}` : v.errors.join(' | '));
} catch (e) {
  check('notary anchor present', false, `readAnchor: ${String(e.message).slice(0, 100)} — notary lane may not be shipped yet`);
}

console.log(`\nSUMMARY: passes=${passes} fails=${fails} | live=${liveOk}/6 | anchor=${anchorOk ? 'VERIFIED' : 'NOT-VERIFIED'}`);
console.log(`SDK: @saos/fleet-sdk 1.0 — keyless, zero-dep, fleet surfaces: ${Object.keys(FLEET).length - 2} + spot-verify`);
process.exit(fails === 0 && liveOk >= 1 ? 0 : 1);
