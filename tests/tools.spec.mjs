/* Spec tests for the DockForge science library.
   Run: node tests/tools.spec.mjs   (or: node --test tests/) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../docs/assets/science.js", import.meta.url), "utf8");

function makeSandbox(withLocalStorage) {
  const sandbox = {};
  if (withLocalStorage) {
    const store = new Map();
    sandbox.localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const S = sandbox.DFScience;
  assert.ok(S, "DFScience global not defined");
  return S;
}

const S = makeSandbox(false);

/* ---------- PDB parsing ---------- */
test("parseAtomLines reads coordinates, residue, element column", () => {
  const t = [
    "ATOM      1  N   DA A   1      10.000  20.000  30.000  1.00  0.00           N",
    "HETATM    2  N1  NT  A  25      11.000  21.000  31.000  1.00  0.00           N",
    "HETATM    3  C4  NT  A  25      12.000  22.000  32.000  1.00  0.00           C",
    "GARBAGE LINE"
  ].join("\n");
  const a = S.parseAtomLines(t);
  assert.equal(a.length, 3);
  assert.equal(a[0].res, "DA");
  assert.equal(a[0]._het, false);
  assert.equal(a[1]._het, true);
  assert.equal(a[1].x, 11);
  assert.equal(a[2].elem, "C");
});

test("parseAtomLines falls back to atom-name element heuristic", () => {
  const t = [
    "HETATM    1  O   HOH A 100      0.000   0.000   0.000  1.00  0.00          O",
    "HETATM    2  Cl1 LIG B   1      1.000   0.000   0.000  1.00  0.00"
  ].join("\n");
  const a = S.parseAtomLines(t);
  // line 2 has no element column -> heuristic: "Cl1" -> "Cl" (second char lowercase)
  assert.equal(a[1].elem, "CL");
});

/* ---------- oligo analysis ---------- */
test("cleanSeq uppercases, strips non-bases, converts U to T", () => {
  assert.equal(S.cleanSeq("ac gU-!3tt"), "ACGTTT");
});

test("complement and reverseComplement", () => {
  assert.equal(S.complement("ACGT"), "TGCA");
  // AcoI-site style palindrome reads the same after RC
  assert.equal(S.reverseComplement("ACGCGT"), "ACGCGT");
});

test("Wallace rule for short oligos", () => {
  // AGGT: AT=2, GC=2 -> 2*2 + 4*2 = 12
  assert.equal(S.oligoStats("AGGT").tm, 12);
  assert.equal(S.oligoStats("AGGT").tmRule, "Wallace");
});

test("long-oligo formula for 20-mers", () => {
  const s20 = "ACGTACGTACGTACGTACGT"; // 10 GC, 20 nt
  const expected = 64.9 + 41 * (10 - 16.4) / 20; // 51.78
  const st = S.oligoStats(s20);
  assert.equal(st.tmRule, "long-oligo");
  assert.ok(Math.abs(st.tm - expected) < 0.05, `tm ${st.tm} vs ${expected}`);
  assert.equal(st.gcPct, 50);
  assert.equal(st.length, 20);
});

test("MW is positive and in the right ballpark", () => {
  const st = S.oligoStats("CGCGCGCGCGCGCGCGCGCG"); // 20-mer
  assert.ok(st.mw > 6000 && st.mw < 7000, `mw ${st.mw}`);
});

/* ---------- geometry: RMSD ---------- */
const rotZ = (p, deg) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
};

test("rmsd of identical sets is zero", () => {
  const P = [[0, 0, 0], [1, 2, 3], [-4, 5, 6], [7, -8, 9], [1.5, 2.5, 3.5]];
  assert.ok(Math.abs(S.rmsd(P, P)) < 1e-10);
});

test("rmsd invariant under rotation + translation (superposition principle)", () => {
  const P = [[0, 0, 0], [3.1, -2.2, 1.7], [-4.4, 5.5, 0.2], [2.2, 8.8, -3.3], [1, 1, 1]];
  // rotate 90 deg about z, then 45 deg about x (compose manually), then translate
  const Q = P.map(p => rotZ(p, 90)).map(p => [
    p[0],
    p[1] * Math.cos(Math.PI / 4) - p[2] * Math.sin(Math.PI / 4),
    p[1] * Math.sin(Math.PI / 4) + p[2] * Math.cos(Math.PI / 4)
  ]).map(p => [p[0] + 100, p[1] + 50, p[2] - 25]);
  const r = S.rmsd(P, Q);
  assert.ok(Math.abs(r) < 1e-6, `rmsd ${r} should be ~0`);
});

test("analytic ground truth: tetrahedron, one vertex displaced delta -> rmsd = delta*sqrt(3)/4", () => {
  // Derivation: displacing one vertex by delta along its axis also moves the centroid by delta/4.
  // In centroid-aligned frames the four points move by 3delta/4, -delta/4, -delta/4, -delta/4 (each
  // along unit axes, mutually orthogonal), so RMSD^2 = (9/16 + 3/16) delta^2 / 4 = 3 delta^2 / 16.
  const delta = 1;
  const P = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const u = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
  const Q = P.map((p, i) => i === 0 ? [p[0] + delta * u[0], p[1] + delta * u[1], p[2] + delta * u[2]] : p.slice());
  const r = S.rmsd(P, Q);
  const expected = delta * Math.sqrt(3) / 4; // 0.4330127...
  assert.ok(Math.abs(r - expected) < 1e-6, `rmsd ${r} vs analytic ${expected}`);
});

test("rmsd scales linearly with a fixed perturbation pattern", () => {
  const P = [[0, 0, 0], [1.1, 0.2, -0.3], [-0.7, 2.2, 1.4], [3.3, -1.1, 0.8]];
  const U = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, -1, -1]].map(v => {
    const n = Math.hypot(...v); return v.map(c => c / n);
  });
  const at = eps => P.map((p, i) => [p[0] + eps * U[i][0], p[1] + eps * U[i][1], p[2] + eps * U[i][2]]);
  const r1 = S.rmsd(P, at(0.01)), r2 = S.rmsd(P, at(0.02));
  assert.ok(Math.abs(r2 - 2 * r1) < 1e-3, `r1 ${r1}, 2*r1 ${2 * r1}, r2 ${r2}`);
});

test("ligandRmsd: identical ligand = 0; translated copy ~= 0; deformed ligand bounded", () => {
  const ref = readFileSync(new URL("../docs/assets/netropsin_ligand.pdb", import.meta.url), "utf8");
  const zero = S.ligandRmsd(ref, ref);
  assert.ok(zero.rmsd < 1e-10 && zero.matched >= 20, `rmsd ${zero.rmsd}, matched ${zero.matched}`);

  const shift = [0.4, -0.3, 0.2];
  const moved = ref.split("\n").map(l => {
    if (!(l.startsWith("ATOM") || l.startsWith("HETATM"))) return l;
    const x = (parseFloat(l.slice(30, 38)) + shift[0]).toFixed(3).padStart(8);
    const y = (parseFloat(l.slice(38, 46)) + shift[1]).toFixed(3).padStart(8);
    const z = (parseFloat(l.slice(46, 54)) + shift[2]).toFixed(3).padStart(8);
    return l.slice(0, 30) + x + y + z + l.slice(54);
  }).join("\n");
  const rt = S.ligandRmsd(moved, ref);
  // coordinates were rebuilt with 1e-3 rounding, so the residual is rounding-dominated
  assert.ok(rt.rmsd < 5e-3, `translated copy rmsd ${rt.rmsd} should superpose to ~0`);

  // deformed: every atom pushed 0.5 A radially out from centroid -> best-fit rmsd <= 0.5, clearly > 0
  const atoms = S.parseAtomLines(ref);
  const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
  const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
  const cz = atoms.reduce((s, a) => s + a.z, 0) / atoms.length;
  const deformed = ref.split("\n").map(l => {
    if (!(l.startsWith("ATOM") || l.startsWith("HETATM"))) return l;
    const x = parseFloat(l.slice(30, 38)), y = parseFloat(l.slice(38, 46)), z = parseFloat(l.slice(46, 54));
    const d = Math.hypot(x - cx, y - cy, z - cz) || 1;
    const f = 1 + 0.5 / d;
    const nx = (cx + (x - cx) * f).toFixed(3).padStart(8);
    const ny = (cy + (y - cy) * f).toFixed(3).padStart(8);
    const nz = (cz + (z - cz) * f).toFixed(3).padStart(8);
    return l.slice(0, 30) + nx + ny + nz + l.slice(54);
  }).join("\n");
  const rd = S.ligandRmsd(deformed, ref);
  assert.ok(rd.rmsd > 0.2 && rd.rmsd <= 0.5 + 1e-9, `deformed rmsd ${rd.rmsd} should be in (0.2, 0.5]`);
});

/* ---------- ligand finding on real structure ---------- */
test("findLigands on 121D: exactly one netropsin instance, no waters", () => {
  const pdb = readFileSync(new URL("../docs/assets/121d.pdb", import.meta.url), "utf8");
  const ligs = S.findLigands(S.parseAtomLines(pdb));
  assert.equal(ligs.length, 1);
  assert.equal(ligs[0].res, "NT");
  assert.equal(ligs[0].atoms.length, 31);
  assert.equal(ligs[0].key, "A|NT|25");
});

test("findLigands ignores waters only files", () => {
  const pdb = "HETATM    1  O   HOH A 100      0.000   0.000   0.000  1.00  0.00          O\n";
  assert.equal(S.findLigands(S.parseAtomLines(pdb)).length, 0);
});

/* ---------- badges (with localStorage stub) ---------- */
test("badges award and persist via localStorage stub", () => {
  const S2 = makeSandbox(true);
  let listed = S2.listBadges();
  assert.equal(listed.find(b => b.id === "graduate").earned, false);
  S2.awardBadge("graduate");
  S2.awardBadge("first-dock");
  listed = S2.listBadges();
  assert.equal(listed.find(b => b.id === "graduate").earned, true);
  assert.equal(listed.find(b => b.id === "first-dock").earned, true);
  assert.equal(listed.find(b => b.id === "archivist").earned, false);
});

test("badge awarding is safe without localStorage", () => {
  // S was created without localStorage; must not throw
  S.awardBadge("validator");
  const listed = S.listBadges();
  assert.equal(listed.length, 6);
});
