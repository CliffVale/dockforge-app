/* DockForge science library — client-side analysis tools, no dependencies.
   All functions pure/deterministic unless noted. Tested in tools.spec.mjs. */
(function (global) {
  "use strict";

  /* ---------------- PDB parsing ---------------- */

  // Parse ATOM/HETATM records into {name,res,resi,chain,x,y,z,elem}
  function parseAtomLines(text) {
    const atoms = [];
    for (const line of String(text || "").split("\n")) {
      if (!(line.startsWith("ATOM") || line.startsWith("HETATM"))) continue;
      let elem = line.slice(76, 78).trim();
      if (!elem) {
        const nm = line.slice(12, 16).trim().replace(/^[0-9]+/, "").replace(/[0-9]+$/, "");
        if (nm.length > 1 && /[a-z]/.test(nm[1])) elem = nm.slice(0, 2);  // e.g. "Cl" in "Cl1"
        else elem = nm ? nm[0] : "";
      }
      atoms.push({
        name: line.slice(12, 16).trim(),
        res: line.slice(17, 20).trim(),
        resi: parseInt(line.slice(22, 26), 10),
        chain: line.slice(21, 22).trim(),
        x: parseFloat(line.slice(30, 38)),
        y: parseFloat(line.slice(38, 46)),
        z: parseFloat(line.slice(46, 54)),
        elem: elem.toUpperCase(),
        _het: line.startsWith("HETATM")
      });
    }
    return atoms.filter(a => !isNaN(a.x) && !isNaN(a.y) && !isNaN(a.z));
  }

  // Extract ligand instances (non-water HETATM records), grouped by chain|res|resi.
  function findLigands(atoms) {
    const WATER = new Set(["HOH", "WAT", "DOD", "H2O"]);
    const map = new Map();
    for (const a of atoms) {
      if (!a._het) continue;          // ATOM records = receptor
      if (WATER.has(a.res)) continue; // waters are not ligands
      const key = a.chain + "|" + a.res + "|" + a.resi;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return Array.from(map.entries()).map(([key, list]) => ({ key, atoms: list, res: list[0].res }));
  }

  /* ---------------- oligo analysis ---------------- */

  const MW = { A: 313.21, T: 304.2, C: 289.18, G: 329.21, U: 305.18 };
  const COMPLEMENT = { A: "T", T: "A", C: "G", G: "C", U: "A" };

  function cleanSeq(seq) {
    return String(seq || "").toUpperCase().replace(/[^ACGTU]/g, "").replace(/U/g, "T");
  }

  function complement(seq) {
    return cleanSeq(seq).split("").map(b => COMPLEMENT[b]).join("");
  }

  function reverseComplement(seq) {
    return complement(seq).split("").reverse().join("");
  }

  function oligoStats(seq) {
    const s = cleanSeq(seq);
    const n = s.length;
    if (!n) return { length: 0 };
    let gc = 0, at = 0;
    for (const b of s) { if (b === "G" || b === "C") gc++; else at++; }
    const gcPct = (100 * gc / n);
    // Wallace rule for < 14 nt; long-oligo (Breslauer-style salt-adjusted) otherwise
    const tm = n < 14
      ? 2 * at + 4 * gc
      : 64.9 + 41 * (gc - 16.4) / n;
    const mw = s.split("").reduce((sum, b) => sum + (MW[b] || 0), 0) + 18.02; // ssDNA: sum of nucleotide masses + water
    return {
      length: n, gcCount: gc, atCount: at,
      gcPct: Math.round(gcPct * 10) / 10,
      tm: Math.round(tm * 10) / 10,
      tmRule: n < 14 ? "Wallace" : "long-oligo",
      mw: Math.round(mw * 10) / 10,
      seq: s
    };
  }

  /* ---------------- geometry: best-fit RMSD (Horn) ---------------- */

  // Eigen-decomposition of a real symmetric matrix via cyclic Jacobi rotations
  // (stable in-place update; each off-diagonal pair touched once per sweep).
  function jacobiEigen(Ain) {
    const n = Ain.length;
    const A = Ain.map(r => r.slice());
    const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-22) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p][q];
          if (Math.abs(apq) < 1e-18) continue;
          const app = A[p][p], aqq = A[q][q];
          const theta = (aqq - app) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          A[p][p] = app - t * apq;
          A[q][q] = aqq + t * apq;
          A[p][q] = A[q][p] = 0;
          for (let k = 0; k < n; k++) {
            if (k === p || k === q) continue;
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = A[p][k] = c * akp - s * akq;
            A[k][q] = A[q][k] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    return A.map((row, i) => ({ value: row[i], vector: V.map(r => r[i]) }))
      .sort((a, b) => b.value - a.value);
  }

  // Best-fit RMSD between two matched point sets (same length, order matters).
  // Kabsch route: rmsd^2 = (Sa + Sb - 2*lambda)/n with
  //   lambda = s1 + s2 + s3*sign(det M),  s_i = singular values of the 3x3
  //   correlation matrix M = sum_i p̃_i q̃_iᵀ (p̃,q̃ = centroid-centered).
  // Mathematically equivalent to Horn's quaternion form, but built from the
  // 3x3 M (less room for transcription error) and guarded by the bound
  // lambda <= (Sa+Sb)/2.
  function rmsd(P, Q) {
    const n = Math.min(P.length, Q.length);
    if (!n) return NaN;
    const ca = [0, 0, 0], cb = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { ca[k] += P[i][k]; cb[k] += Q[i][k]; }
    for (let k = 0; k < 3; k++) { ca[k] /= n; cb[k] /= n; }
    let Sa = 0, Sb = 0;
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < n; i++) {
      const p = [P[i][0] - ca[0], P[i][1] - ca[1], P[i][2] - ca[2]];
      const q = [Q[i][0] - cb[0], Q[i][1] - cb[1], Q[i][2] - cb[2]];
      Sa += p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
      Sb += q[0] * q[0] + q[1] * q[1] + q[2] * q[2];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r][c] += p[r] * q[c];
    }
    // MtM = Mᵀ M  (symmetric, eigenvalues = squared singular values of M)
    const MtM = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) MtM[r][c] += M[k][r] * M[k][c];
    const sv = jacobiEigen(MtM).map(e => Math.sqrt(Math.max(e.value, 0)));
    const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
              - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
              + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    let lambda = sv[0] + sv[1] + (det >= 0 ? 1 : -1) * sv[2];
    lambda = Math.min(lambda, (Sa + Sb) / 2); // defensive: mathematical bound
    return Math.sqrt(Math.max(Sa + Sb - 2 * lambda, 0) / n);
  }

  // Ligand RMSD between two PDB texts, matched per-atom by index within the same residue
  function ligandRmsd(posePdbText, refPdbText) {
    const A = parseAtomLines(posePdbText), B = parseAtomLines(refPdbText);
    const P = [], Q = [];
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      P.push([A[i].x, A[i].y, A[i].z]);
      Q.push([B[i].x, B[i].y, B[i].z]);
    }
    if (P.length < 3) return { rmsd: NaN, matched: P.length, note: "too few atoms" };
    return { rmsd: rmsd(P, Q), matched: P.length, note: "" };
  }

  /* ---------------- badges ---------------- */

  const BADGES = [
    { id: "graduate", icon: "🎓", name: "Course Graduate", hint: "Finish all 7 lessons" },
    { id: "first-dock", icon: "🚀", name: "First Dock", hint: "Load your first docking output in the Result Viewer" },
    { id: "validator", icon: "🧭", name: "Pose Validator", hint: "Run a redocking validation against a reference ligand" },
    { id: "sharp-eye", icon: "🎯", name: "Sharp Eye", hint: "Redock a crystal ligand with RMSD < 2 Å" },
    { id: "base-pairs", icon: "🧬", name: "Base Pair Scholar", hint: "Analyze 3 different oligos in the designer" },
    { id: "archivist", icon: "📔", name: "Lab Archivist", hint: "Export a lab notebook entry" }
  ];

  function awardBadge(id) {
    try {
      const raw = JSON.parse(localStorage.getItem("dockforge-badges-v1") || "{}");
      if (!raw[id]) {
        raw[id] = Date.now();
        localStorage.setItem("dockforge-badges-v1", JSON.stringify(raw));
      }
    } catch (e) { /* private mode */ }
  }
  function listBadges() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem("dockforge-badges-v1") || "{}"); } catch (e) {}
    return BADGES.map(b => ({ ...b, earned: !!raw[b.id], at: raw[b.id] || null }));
  }

  /* ---------------- export ---------------- */

  global.DFScience = {
    parseAtomLines, findLigands,
    cleanSeq, complement, reverseComplement, oligoStats,
    jacobiEigen, rmsd, ligandRmsd,
    BADGES, awardBadge, listBadges
  };
})(typeof window !== "undefined" ? window : globalThis);
