/* DockForge format library — read/write/detect the file formats used across the
   molecular-docking ecosystem. Pure client-side JS, no dependencies.

   Every layout here was implemented from a verified primary source and is tested
   against real files (see tests/formats.spec.mjs and tests/fixtures/):
   - PDB/PDBQT .... wwPDB v3.3 column spec; PDBQT atom lines from real Webina
                    benchmark files (charge cols 71-76, AD type cols 78-79)
   - SDF/MOL ...... MDL V2000 counts + atom/bond blocks (real PubChem + RDKit
                    files), V3000 subset
   - MOL2 ......... TRIPOS format (real OpenBabel test file)
   - mmCIF ........ PDBx/mmCIF loops (real RCSB 1BNA.cif); RCSB ligand CIF
                    (chem_comp_atom / chem_comp_bond)
   - XYZ .......... de-facto standard (count, comment, x y z [elem])
   - GRO .......... GROMACS; coordinates are in NANOMETERS (writer/reader convert)
   - CHARMM CRD ... CARD format (layout from VMD write_charmm_crd.tcl),
                    normal + EXT
   - PSF .......... CHARMM/XPLOR topology (atoms + bonds sections)
   - AlphaFold .... PDB with pLDDT in the B-factor column (per AFDB FAQ)
   - Vina ......... config file keys per vina.scripps.edu/manual; output PDBQT
                    REMARK VINA RESULT lines; AutoDock GPF/DPF keyword files
   - HDOCK ........ result text (ranks / docking scores / ligand RMSDs)
   - ChimeraX ..... .cxc command files (open / alphafold fetch / color)
   Writers emit only what we can honestly produce (coordinates + element + charge
   where the format has it); bond tables are emitted only when known. */
(function (global) {
  "use strict";

  /* ============================ shared helpers ============================ */

  function elementFromSymbol(s) {
    // "Cl" -> Cl, "CL" -> Cl, "C" -> C, "" -> X
    const t = String(s || "").trim();
    if (!t) return "X";
    return t[0].toUpperCase() + (t.length > 1 ? t[1].toLowerCase() : "");
  }

  // PDB atom-name formatting rule (wwPDB v3.3): the name field is 4 chars
  // (cols 13-16). 1-char element names are right-justified so the symbol
  // starts in column 14; multi-char element names start in column 13.
  function fmtAtomName(name, elem) {
    const n = String(name || "").slice(0, 4);
    const el = elementFromSymbol(elem);
    if (el.length === 1 && n.length < 4) return (" " + n).padEnd(4, " ");
    return n.padEnd(4, " ").slice(0, 4);
  }

  function isWater(res) { return /^(HOH|WAT|DOD|H2O|SOL)$/.test(res); }

  // One normalized atom shape for every reader:
  // {serial,name,alt,res,resi,chain,x,y,z,elem,occ,bfac,charge,adtype,het,model}
  function blankAtom() {
    return { serial: 0, name: "", alt: "", res: "", resi: 0, icode: "", chain: "",
             x: NaN, y: NaN, z: NaN, elem: "X", occ: 1, bfac: 0,
             charge: null, adtype: "", het: false, model: 1 };
  }

  /* ============================== detection =============================== */

  function detectFormat(name, text) {
    const t = String(text || "");
    const head = t.slice(0, 4096);
    const ext = String(name || "").toLowerCase().split(".").pop();
    const first = (t.split("\n", 1)[0] || "").trimEnd();

    if (/@<TRIPOS>MOLECULE/m.test(head)) return "mol2";

    // CIF family: mmCIF (has _atom_site) vs RCSB ligand dictionary (_chem_comp_atom
    // without _atom_site — real mmCIF entries also embed chem_comp loops for
    // their components, so order matters here).
    if (/_atom_site\./.test(t) && /loop_/.test(t)) return "mmcif";
    if (/_chem_comp_atom\./.test(t)) return "ligand-cif";
    if (/^data_/m.test(head) && /loop_/.test(head)) return "mmcif";

    if (/^ITEM: TIMESTEP/m.test(head)) return "lammps"; // recognized, not parsed
    // Coordinate files: PDB vs PDBQT. PDBQT tells: ROOT/BRANCH/TORSDOF records,
    // or an AutoDock atom type in cols 78-79 (A, OA, NA, SA, HD — not valid
    // element symbols) together with a partial charge in cols 71-76. PDB-only
    // records (SEQRES/HELIX/CRYST1…) force the PDB verdict.
    if (t.match(/^(ATOM  |HETATM)[^\n]*/m)) {
      const hasPdbqtStruct = /^(ROOT|ENDROOT|BRANCH|ENDBRANCH|TORSDOF)\s*$/m.test(t);
      const hasPdbRecords = /^(SEQRES|HELIX |SHEET |SSBOND|SITE |CRYST1|FORMUL|HET   )/m.test(t);
      const adTypes = new Set(["A", "OA", "NA", "SA", "HD", "HS", "NS", "OS", "e", "W", "G",
                               "CG", "G0", "G1", "G2", "G3", "CG0"]);
      const coordLines = t.split("\n").filter(l => /^(ATOM  |HETATM)/.test(l)).slice(0, 5);
      const looksPdbqt = coordLines.some(l => {
        const adt = l.slice(77, 79).trim();
        const chg = l.slice(70, 76).trim();
        return adTypes.has(adt) && chg !== "" && !isNaN(parseFloat(chg));
      });
      if (hasPdbRecords && !hasPdbqtStruct) return "pdb";
      if (hasPdbqtStruct || looksPdbqt) return "pdbqt";
      return "pdb";
    }

    // MDL SDF/MOL: counts line followed by V2000/V3000 marker
    if (/\bV2000\b|\bV3000\b/.test(t) && /^\s*\d+\s+\d+\s+\d/.test(t.split("\n")[3] || "")) return "sdf";

    if (/!NATOM/.test(t)) return "psf";
    if (/^(\*|\s{0,5}\d+\s*$)/.test(first) || /^\*/.test(first)) {
      // CHARMM CRD: '*' title lines then %5d count (or EXT)
      const lines = t.split("\n").filter(l => l.trim() !== "");
      if (lines[0] && lines[0].startsWith("*")) {
        const nline = lines[1] || "";
        if (/^\s*\d+\s*$/.test(nline) || /^\s*\d+\s+EXT\s*$/.test(nline)) return "crd";
      }
    }
    if (/\bnpts\b/.test(t) && /\b(gridfld|ligand_types|gridcenter|spacing)\b/.test(t)) return "gpf";
    if (/\b(outlev|run|move|fld|map|about|space|dielectric|intnbp)\b/.test(t) &&
        /^\s*(outlev|intnbp|param_|ligand_types|run|move|fld|map|about|space|dielectric)\b/m.test(t)) return "dpf";
    if (/^\s*[\w.]+\s*=\s*\S+/m.test(t) &&
        /\b(exhaustiveness|center_x|size_x|energy_range|num_modes|score_only|local_only)\b/.test(t)) return "vina-config";
    if (/\bDocking Score\b|\bDocking score\b|\bLigand rmsd\b|Top 10 Predictions/i.test(t)) return "hdock-out";
    if (/^\s*(open|alphafold|color|show|hide|view|turn|matchmaker|measure)\b/m.test(t) && !/[{};]/.test(t.slice(0, 200))) return "cxc";
    if (/^\s*\d+\s*$/.test(first) && /^\s*[\w"' ]+\s*$/.test(t.split("\n")[1] || "")) {
      const n = parseInt(first, 10);
      if (n > 0 && n < 100000 && (t.split("\n")[2] || "").trim().split(/\s+/).length >= 4) return "xyz";
    }
    if (/(^|\n)\s*\d+\s*EXT\s*(\n|$)/.test(t.slice(0, 512))) return "crd";
    if (ext === "gro" || /^.{0,80}\n\s*\d+\s*$/.test(t.slice(0, 120)) && /\n\s*\d+\w+\s+\S+\s+\S+\s+\d/.test(t)) return "gro";
    if (/\$\$notebook|\$COORD|\$TOPOLOGY/i.test(t)) return "insightii"; // recognized, not parsed
    if (ext === "pdb") return "pdb";
    if (ext === "cif" || ext === "mmcif") return /_atom_site\./.test(t) ? "mmcif" : "ligand-cif";
    if (ext === "sdf" || ext === "mol") return "sdf";
    if (ext === "mol2") return "mol2";
    if (ext === "pdbqt") return "pdbqt";
    if (ext === "xyz") return "xyz";
    if (ext === "gro") return "gro";
    if (ext === "crd" || ext === "cor") return "crd";
    if (ext === "psf") return "psf";
    if (ext === "cxc") return "cxc";
    if (ext === "gpf") return "gpf";
    if (ext === "dpf") return "dpf";
    if (ext === "txt" || ext === "out" || ext === "log") {
      if (/vina/i.test(head)) return "log-text";
      return "unknown";
    }
    return "unknown";
  }

  /* ============================ PDB + PDBQT =============================== */

  // Parse PDB (or PDBQT) text. Handles MODEL/ENDMDL (multi-model Vina output),
  // CONECT bonds, and PDBQT extras (charge + AutoDock type).
  function readPdb(text, opts) {
    const asPdbqt = !!(opts && opts.pdbqt);
    const lines = String(text || "").split("\n");
    const atoms = [], bonds = [], models = [];
    const serialIdx = new Map();
    let curModel = 0, score = null, scores = [];
    for (const line of lines) {
      const rec = line.slice(0, 6);
      if (rec.startsWith("MODEL")) {
        curModel = parseInt(line.slice(10, 14), 10) || models.length + 1;
        continue;
      }
      if (rec.startsWith("ENDMDL")) { models.push(atoms.length); score = null; continue; }
      if (asPdbqt && rec.startsWith("REMARK") && line.includes("VINA RESULT")) {
        // "REMARK VINA RESULT:    -7.3      0.000      0.000" (score, rmsd_lb, rmsd_ub)
        const m = line.match(/VINA RESULT:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        if (m) {
          scores.push({ score: parseFloat(m[1]), rmsd_lb: parseFloat(m[2]), rmsd_ub: parseFloat(m[3]) });
        }
        continue;
      }
      if (rec.startsWith("CONECT")) {
        const a = parseInt(line.slice(6, 11), 10);
        for (let c = 11; c + 5 <= Math.min(line.length, 66); c += 5) {
          const b = parseInt(line.slice(c, c + 5), 10);
          if (!isNaN(a) && !isNaN(b) && b > a) bonds.push([a, b]);
        }
        continue;
      }
      if (!(rec.startsWith("ATOM") || rec.startsWith("HETATM"))) continue;
      const a = blankAtom();
      a.serial = parseInt(line.slice(6, 11), 10) || atoms.length + 1;
      a.name = line.slice(12, 16).trim();
      a.alt = line.slice(16, 17);
      a.res = line.slice(17, 20).trim();
      a.chain = line.slice(21, 22).trim();
      a.resi = parseInt(line.slice(22, 26), 10) || 0;
      a.icode = line.slice(26, 27).trim();
      a.x = parseFloat(line.slice(30, 38));
      a.y = parseFloat(line.slice(38, 46));
      a.z = parseFloat(line.slice(46, 54));
      a.occ = parseFloat(line.slice(54, 60)) || 0;
      a.bfac = parseFloat(line.slice(60, 66)) || 0;
      a.het = rec.startsWith("HETATM");
      if (asPdbqt) {
        a.charge = parseFloat(line.slice(70, 76));
        a.adtype = line.slice(77, 79).trim();
        a.elem = elementFromSymbol(a.adtype.replace(/^A$/, "C").replace(/^(OA|NA|SA)$/, a.adtype[0]).replace(/^(HD|HS)$/, "H"));
        if (isNaN(a.charge)) a.charge = null;
      } else {
        let elem = line.slice(76, 78).trim();
        if (!elem) {
          const nm = a.name.replace(/^[0-9]+/, "").replace(/[0-9]+$/, "");
          elem = nm.length > 1 && /[a-z]/.test(nm[1]) ? nm.slice(0, 2) : (nm ? nm[0] : "");
        }
        a.elem = elementFromSymbol(elem);
      }
      if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) continue;
      a.model = curModel || 1;
      serialIdx.set(a.serial, atoms.length);
      atoms.push(a);
    }
    // resolve CONECT serials to indices
    const resolved = bonds.map(([s1, s2]) => {
      const i = serialIdx.get(s1), j = serialIdx.get(s2);
      return (i !== undefined && j !== undefined) ? [i, j] : null;
    }).filter(Boolean);
    const multi = models.length > 0 && models[0] !== atoms.length;
    return { format: asPdbqt ? "pdbqt" : "pdb", atoms, bonds: resolved, scores,
             models: multi ? models : [], meta: { multiModel: multi } };
  }

  function readPdbqt(text) { return readPdb(text, { pdbqt: true }); }

  // AlphaFold models: pLDDT lives in the B-factor column (per AFDB FAQ).
  function plddtFromAtoms(atoms) {
    const perResi = new Map();
    for (const a of atoms) {
      if (a.model !== 1) continue;
      const k = a.chain + "|" + a.resi;
      if (!perResi.has(k)) perResi.set(k, { resi: a.resi, chain: a.chain, res: a.res, bfac: a.bfac });
    }
    return Array.from(perResi.values()).map(r => ({ ...r, plddt: r.bfac }));
  }

  function toPdb(atoms, opts) {
    const o = opts || {};
    const out = [];
    if (o.title) out.push("HEADER    " + String(o.title).slice(0, 60));
    let serial = (o.startSerial || 1);
    for (const a of atoms) {
      const rec = a.het ? "HETATM" : "ATOM  ";
      const alt1 = (a.alt == null ? " " : String(a.alt).slice(0, 1).padEnd(1, " "));
      const name = fmtAtomName(a.name, a.elem);
      const res = String(a.res || "UNL").slice(0, 3).padStart(3, " ");
      const chain = String(a.chain || " ").slice(0, 1);
      const resi = Math.max(-999, Math.min(9999, a.resi || 1));
      const x = a.x == null || isNaN(a.x) ? 0 : a.x;
      const y = a.y == null || isNaN(a.y) ? 0 : a.y;
      const z = a.z == null || isNaN(a.z) ? 0 : a.z;
      const occ = (a.occ == null || isNaN(a.occ)) ? 1 : a.occ;
      const bf = (a.bfac == null || isNaN(a.bfac)) ? 0 : a.bfac;
      const el = elementFromSymbol(a.elem).padStart(2, " ").slice(0, 2);
      // Column-exact assembly (wwPDB v3.3): name 13-16, altLoc 17, resName 18-20,
      // chain 22, resSeq 23-26, iCode 27, x/y/z 31-54, occ 55-60, bfac 61-66,
      // element 77-78. No separator spaces inside fixed fields.
      out.push(
        rec + String(serial).padStart(5, " ") + " " + name + alt1 + res + " " + chain +
        String(resi).padStart(4, " ") + (a.icode ? String(a.icode).slice(0, 1) : " ") + "   " +
        x.toFixed(3).padStart(8, " ") + y.toFixed(3).padStart(8, " ") + z.toFixed(3).padStart(8, " ") +
        occ.toFixed(2).padStart(6, " ") + bf.toFixed(2).padStart(6, " ") + "          " +
        el.padEnd(2, " ")
      );
      serial++;
    }
    if (o.conect && o.conect.length && o.conect.length <= 10000) {
      const byFirst = new Map();
      for (const [i, j] of o.conect) {
        if (!byFirst.has(i)) byFirst.set(i, []);
        byFirst.get(i).push(j);
      }
      for (const [i, js] of byFirst) {
        for (let k = 0; k < js.length; k += 4) {
          out.push("CONECT" + String(i + (o.startSerial || 1)).padStart(5, " ") +
            js.slice(k, k + 4).map(j => String(j + (o.startSerial || 1)).padStart(5, " ")).join(""));
        }
      }
    }
    out.push("END");
    return out.join("\n") + "\n";
  }

  function toPdbqt(atoms, opts) {
    const o = opts || {};
    const out = ["ROOT"];
    let serial = 1;
    for (const a of atoms) {
      const rec = "HETATM";
      const name = fmtAtomName(a.name, a.elem);
      const res = String(a.res || "UNL").slice(0, 3).padStart(3, " ");
      const chain = String(a.chain || " ").slice(0, 1);
      const resi = Math.max(-999, Math.min(9999, a.resi || 1));
      const x = a.x == null || isNaN(a.x) ? 0 : a.x;
      const y = a.y == null || isNaN(a.y) ? 0 : a.y;
      const z = a.z == null || isNaN(a.z) ? 0 : a.z;
      const charge = (a.charge == null || isNaN(a.charge)) ? 0 : a.charge;
      const adt = String(a.adtype || a.elem).slice(0, 2).padEnd(2, " ");
      out.push(
        rec + String(serial).padStart(5, " ") + " " + name + " " + res + " " + chain +
        String(resi).padStart(4, " ") + "    " +
        x.toFixed(3).padStart(8, " ") + y.toFixed(3).padStart(8, " ") + z.toFixed(3).padStart(8, " ") +
        "  1.00  0.00    " + charge.toFixed(3).padStart(6, " ") + " " + adt
      );
      serial++;
    }
    out.push("ENDROOT");
    out.push("TORSDOF " + (o.torsdof != null ? o.torsdof : 0));
    return out.join("\n") + "\n";
  }

  /* ================================ SDF =================================== */

  function splitSdfRecords(text) {
    return String(text || "").split(/\$\$\$\$\s*\n?/).filter(r => r.trim() !== "");
  }

  // Parse one SDF/MOL record (V2000 primarily; V3000 atom block subset).
  function readSdfRecord(rec) {
    const lines = rec.split("\n");
    const atoms = [], bonds = [];
    // V3000?
    if (/M {2}V30 BEGIN CTAB/.test(rec)) return readSdfV3000(lines);
    if (lines.length < 4) return { atoms, bonds, meta: {}, error: "record too short" };
    const title = lines[0] || "";
    const counts = lines[3] || "";
    const nAtoms = parseInt(counts.slice(0, 3), 10);
    const nBonds = parseInt(counts.slice(3, 6), 10);
    if (isNaN(nAtoms) || nAtoms < 0 || nAtoms > 50000) return { atoms, bonds, meta: { title }, error: "bad counts line" };
    for (let i = 0; i < nAtoms; i++) {
      const line = lines[4 + i] || "";
      const a = blankAtom();
      // columns: x 0-10, y 10-20, z 20-30, space, symbol 31-34 (tolerant fallback)
      a.x = parseFloat(line.slice(0, 10));
      a.y = parseFloat(line.slice(10, 20));
      a.z = parseFloat(line.slice(20, 30));
      let sym = line.slice(31, 34).trim();
      if (!sym) {
        const toks = line.trim().split(/\s+/);
        sym = toks[3] || "";
      }
      a.elem = elementFromSymbol(sym);
      a.name = a.elem + (i + 1);
      a.res = "LIG"; a.resi = 1; a.het = true;
      const massDiff = parseInt(line.slice(34, 36), 10);
      const chgCode = parseInt(line.slice(36, 39), 10);
      a.charge = [0, 3, 2, 1, 0, -1, -2, -3][chgCode] || 0; // MDL charge codes
      if (isNaN(a.charge)) a.charge = 0;
      if (massDiff === 1) a.name = a.elem + (i + 1);
      if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) return { atoms, bonds, meta: { title }, error: "bad atom line " + (i + 1) };
      atoms.push(a);
    }
    for (let i = 0; i < (isNaN(nBonds) ? 0 : nBonds); i++) {
      const line = lines[4 + nAtoms + i] || "";
      const a1 = parseInt(line.slice(0, 3), 10);
      const a2 = parseInt(line.slice(3, 6), 10);
      const type = parseInt(line.slice(6, 9), 10);
      if (!isNaN(a1) && !isNaN(a2) && a1 >= 1 && a2 >= 1) bonds.push([a1 - 1, a2 - 1, isNaN(type) ? 1 : type]);
    }
    // Property lines: "M  CHG nn8 aaa vvv ..." (CTfile spec) — authoritative
    // atom charges overriding the MDL codes in columns 36-38 of atom lines.
    for (const line of lines) {
      if (!/^M {2}CHG/.test(line)) continue;
      const toks = line.slice(6).trim().split(/\s+/);
      const n = parseInt(toks[0], 10);
      if (isNaN(n)) continue;
      for (let k = 0; k < n; k++) {
        const idx = parseInt(toks[1 + 2 * k], 10);
        const chg = parseInt(toks[2 + 2 * k], 10);
        if (!isNaN(idx) && !isNaN(chg) && atoms[idx - 1]) atoms[idx - 1].charge = chg;
      }
    }
    return { atoms, bonds, meta: { title } };
  }

  function readSdfV3000(lines) {
    const atoms = [], bonds = [];
    let inAtom = false, inBond = false;
    for (const line of lines) {
      if (/M {2}V30 BEGIN ATOM/.test(line)) { inAtom = true; continue; }
      if (/M {2}V30 END ATOM/.test(line)) { inAtom = false; continue; }
      if (/M {2}V30 BEGIN BOND/.test(line)) { inBond = true; continue; }
      if (/M {2}V30 END BOND/.test(line)) { inBond = false; continue; }
      const body = line.replace(/^M {2}V30\s*/, "").trim();
      if (inAtom) {
        const toks = body.split(/\s+/); // idx type x y z aamap [CHG=n ...]
        if (toks.length >= 6) {
          const a = blankAtom();
          a.elem = elementFromSymbol(toks[1].replace(/\(.*/, ""));
          a.x = parseFloat(toks[2]); a.y = parseFloat(toks[3]); a.z = parseFloat(toks[4]);
          a.name = a.elem + toks[0]; a.res = "LIG"; a.resi = 1; a.het = true;
          const chg = body.match(/CHG=(-?\d+)/);
          a.charge = chg ? parseInt(chg[1], 10) : 0;
          if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) return { atoms, bonds, error: "bad V3000 atom" };
          atoms.push(a);
        }
      } else if (inBond) {
        const toks = body.split(/\s+/);
        if (toks.length >= 4) bonds.push([parseInt(toks[2], 10) - 1, parseInt(toks[3], 10) - 1, parseInt(toks[1], 10)]);
      }
    }
    return { atoms, bonds, meta: { v3000: true } };
  }

  function readSdf(text) {
    const recs = splitSdfRecords(text);
    if (!recs.length) return { format: "sdf", records: [], atoms: [], error: "no records" };
    const parsed = recs.map(readSdfRecord);
    const bad = parsed.find(p => p.error);
    return { format: "sdf", records: parsed, atoms: parsed[0].atoms, bonds: parsed[0].bonds || [],
             meta: { recordCount: recs.length, ...(bad ? { warning: bad.error } : {}) } };
  }

  function toSdf(atoms, opts) {
    const o = opts || {};
    const bonds = o.bonds || [];
    const out = [
      (o.title || "DockForge export").slice(0, 80),
      "  DockForge  format lib",
      "",
      String(atoms.length).padStart(3, " ") + String(bonds.length).padStart(3, " ") + "  0  0  0  0  0  0  0  0999 V2000"
    ];
    for (const a of atoms) {
      const x = a.x == null || isNaN(a.x) ? 0 : a.x;
      const y = a.y == null || isNaN(a.y) ? 0 : a.y;
      const z = a.z == null || isNaN(a.z) ? 0 : a.z;
      // MDL charge codes (CTfile V2000 cols 37-39): 0=none,1=+3,2=+2,3=+1,
      // 5=-1,6=-2,7=-3. Charges outside that range go to M  CHG lines.
      const q = (a.charge == null || isNaN(a.charge)) ? 0 : a.charge;
      const codeMap = { "3": 1, "2": 2, "1": 3, "0": 0, "-1": 5, "-2": 6, "-3": 7 };
      const code = codeMap[String(q)];
      const codeField = code != null ? String(code).padStart(3, " ") : "  0";
      // Field layout after coords: space(31) symbol 32-34, massDiff 35-36,
      // charge 37-39, then 10 more fields (stereo, H+, box, valence, H0, ...).
      out.push(x.toFixed(4).padStart(10, " ") + y.toFixed(4).padStart(10, " ") + z.toFixed(4).padStart(10, " ") +
        " " + elementFromSymbol(a.elem).padEnd(3, " ") + " 0" + codeField + "  0".repeat(10));
    }
    for (const b of bonds) {
      out.push(String((b[0] | 0) + 1).padStart(3, " ") + String((b[1] | 0) + 1).padStart(3, " ") +
        String(b[2] == null ? 1 : b[2]).padStart(3, " "));
    }
    // M  CHG property lines for charges the atom-line codes cannot express
    // (|q|>3 or non-integer). Format: "M  CHG nn8 aaa vvv ..." (CTfile spec).
    const extras = [];
    for (let i = 0; i < atoms.length; i++) {
      const q = atoms[i] && atoms[i].charge;
      if (q == null || isNaN(q) || q === 0) continue;
      if ({ "3": 1, "2": 2, "1": 3, "0": 0, "-1": 5, "-2": 6, "-3": 7 }[String(q)] != null) continue;
      extras.push(String(i + 1).padStart(3, " ") + String(Math.round(q)).padStart(4, " "));
    }
    for (let k = 0; k < extras.length; k += 8) {
      out.push("M  CHG" + String(Math.min(8, extras.length - k)).padStart(3, " ") + " " + extras.slice(k, k + 8).join(" "));
    }
    out.push("M  END");
    return out.join("\n") + "\n$$$$\n";
  }

  /* ================================ MOL2 ================================== */

  function readMol2(text) {
    const t = String(text || "");
    const lines = t.split("\n");
    const atoms = [], bonds = [];
    let section = null, meta = { molName: "" };
    let molCounts = null;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (line.startsWith("@<TRIPOS>")) {
        section = line.slice(9).trim().toUpperCase();
        if (section === "MOLECULE") {
          const m = lines[li + 1];
          const c = lines[li + 3];
          if (m != null) meta.molName = m.trim();
          if (c != null) molCounts = c.trim().split(/\s+/).map(v => parseInt(v, 10));
        }
        continue;
      }
      if (section === "ATOM" && line.trim()) {
        const toks = line.trim().split(/\s+/);
        // id name x y z type subst_id subst_name charge [status]
        if (toks.length >= 6) {
          const a = blankAtom();
          a.serial = parseInt(toks[0], 10) || atoms.length + 1;
          a.name = toks[1];
          a.x = parseFloat(toks[2]); a.y = parseFloat(toks[3]); a.z = parseFloat(toks[4]);
          const mt = toks[5] || ""; // e.g. "C.3", "O.2", "Cl", "H"
          a.elem = elementFromSymbol(mt.split(".")[0]);
          a.adtype = mt;
          if (toks.length >= 9) { const q = parseFloat(toks[8]); a.charge = isNaN(q) ? null : q; }
          a.res = toks[7] && !/^-?\d/.test(toks[7]) ? toks[7] : (toks[6] ? "S" + toks[6] : "UNL");
          a.resi = 1;
          a.het = true;
          if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) return { format: "mol2", atoms, bonds, error: "bad atom line" };
          atoms.push(a);
        }
      } else if (section === "BOND" && line.trim()) {
        const toks = line.trim().split(/\s+/);
        if (toks.length >= 4) {
          const a1 = parseInt(toks[1], 10), a2 = parseInt(toks[2], 10);
          if (!isNaN(a1) && !isNaN(a2)) bonds.push([a1 - 1, a2 - 1, toks[3]]);
        }
      }
    }
    return { format: "mol2", atoms, bonds, meta };
  }

  function toMol2(atoms, opts) {
    const o = opts || {};
    const bonds = o.bonds || [];
    const out = [
      "@<TRIPOS>MOLECULE",
      (o.title || "DockForge export"),
      " " + String(atoms.length).padStart(3, " ") + String(bonds.length).padStart(4, " ") + " 0 0 0",
      "SMALL",
      bonds.length ? "USER_CHARGES" : "NO_CHARGES",
      "",
      "@<TRIPOS>ATOM"
    ];
    atoms.forEach((a, i) => {
      const x = a.x == null || isNaN(a.x) ? 0 : a.x;
      const y = a.y == null || isNaN(a.y) ? 0 : a.y;
      const z = a.z == null || isNaN(a.z) ? 0 : a.z;
      const type = a.adtype && /[.]/.test(a.adtype) ? a.adtype : elementFromSymbol(a.elem);
      const charge = (a.charge == null || isNaN(a.charge)) ? 0 : a.charge;
      out.push(String(i + 1).padStart(7, " ") + " " + String(a.name || a.elem + (i + 1)).slice(0, 8).padEnd(8, " ") +
        x.toFixed(4).padStart(10, " ") + y.toFixed(4).padStart(10, " ") + z.toFixed(4).padStart(10, " ") +
        " " + type.padEnd(6, " ") + " 1 " + "LIG".padEnd(8, " ") + charge.toFixed(4).padStart(10, " "));
    });
    if (bonds.length) {
      out.push("@<TRIPOS>BOND");
      bonds.forEach((b, i) => {
        out.push(String(i + 1).padStart(6, " ") + String((b[0] | 0) + 1).padStart(6, " ") +
          String((b[1] | 0) + 1).padStart(6, " ") + " " + (b[2] == null ? 1 : b[2]));
      });
    }
    return out.join("\n") + "\n";
  }

  /* =========================== mmCIF + ligand CIF ========================= */

  // Tokenize one CIF line, honoring quotes and stripping # comments.
  function tokenizeCifLine(line) {
    const toks = [];
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "#") break;
      if (c === "'" || c === "\"") {
        let j = i + 1;
        while (j < line.length && !(line[j] === c && (line[j + 1] === " " || line[j + 1] === undefined || line[j + 1] === "\t"))) j++;
        toks.push(line.slice(i + 1, j));
        i = j + 1;
      } else {
        let j = i;
        while (j < line.length && line[j] !== " " && line[j] !== "\t" && line[j] !== "#") j++;
        toks.push(line.slice(i, j));
        i = j;
      }
    }
    return toks;
  }

  // Parse all loop_ blocks of a CIF file -> [{tags:[], rows:[[v,...],...]}]
  function parseCifLoops(text) {
    const lines = String(text || "").split("\n");
    const loops = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "loop_") {
        i++;
        const tags = [];
        while (i < lines.length && lines[i].trim().startsWith("_")) {
          tags.push(lines[i].trim().split(/\s+/)[0]);
          i++;
        }
        const rows = [];
        let cur = [];
        while (i < lines.length) {
          const l = lines[i];
          const tr = l.trim();
          if (tr === "loop_" || (tr.startsWith("_") && !tags.some(tg => tr.startsWith(tg + " "))) && cur.length) break;
          if (tr === "# " || tr === "#") break;
          if (tr.startsWith("#")) { i++; continue; }
          if (tr === "") {
            if (cur.length) { rows.push(cur); cur = []; }
            i++; continue;
          }
          const toks = tokenizeCifLine(l);
          for (const tk of toks) {
            cur.push(tk === "." || tk === "?" ? "" : tk);
            if (cur.length === tags.length) { rows.push(cur); cur = []; }
          }
          i++;
        }
        if (cur.length) rows.push(cur);
        loops.push({ tags, rows });
      } else {
        i++;
      }
    }
    return loops;
  }

  function readMmcif(text) {
    const loops = parseCifLoops(text);
    const atomLoop = loops.find(L => L.tags.some(t => t.startsWith("_atom_site.")));
    if (!atomLoop) return { format: "mmcif", atoms: [], bonds: [], meta: { warning: "no atom_site loop" } };
    const col = {};
    atomLoop.tags.forEach((t, i) => { col[t.replace("_atom_site.", "")] = i; });
    const atoms = [];
    for (const row of atomLoop.rows) {
      const a = blankAtom();
      a.serial = parseInt(row[col.id], 10) || atoms.length + 1;
      a.name = (row[col.label_atom_id] || "").replace(/"/g, "");
      a.res = row[col.label_comp_id] || "";
      a.resi = parseInt(row[col.label_seq_id], 10) || parseInt(row[col.auth_seq_id], 10) || 0;
      if (col.pdbx_PDB_ins_code !== undefined) a.icode = String(row[col.pdbx_PDB_ins_code] || "").replace(/[.?]/g, "");
      a.chain = row[col.auth_asym_id] || row[col.label_asym_id] || "";
      a.x = parseFloat(row[col.Cartn_x]); a.y = parseFloat(row[col.Cartn_y]); a.z = parseFloat(row[col.Cartn_z]);
      a.occ = parseFloat(row[col.occupancy]) || 1;
      a.bfac = parseFloat(row[col.B_iso_or_equiv]) || 0;
      if (col.pdbx_PDB_model_num !== undefined) a.model = parseInt(row[col.pdbx_PDB_model_num], 10) || 1;
      const gi = row[col.group_PDB] || "ATOM";
      a.het = gi === "HETATM";
      const typeSym = row[col.type_symbol] || "";
      a.elem = elementFromSymbol(typeSym || a.name);
      if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) continue;
      atoms.push(a);
    }
    // Multi-model support (NMR ensembles): boundaries per pdbx_PDB_model_num,
    // same shape readPdb returns for MODEL/ENDMDL.
    const modelNums = [];
    for (const a of atoms) { if (!modelNums.includes(a.model)) modelNums.push(a.model); }
    const models = modelNums.length > 1 ? modelNums.map((m, i) => {
      let last = 0;
      for (const a of atoms) { if (a.model === m) last = Math.max(last, atoms.indexOf(a) + 1); }
      return last;
    }) : [];
    return { format: "mmcif", atoms, bonds: [], models, meta: { multiModel: models.length > 0 } };
  }

  // RCSB ligand dictionary CIF (chem_comp_atom / chem_comp_bond)
  function readLigandCif(text) {
    const loops = parseCifLoops(text);
    const atomLoop = loops.find(L => L.tags.some(t => t.startsWith("_chem_comp_atom.")));
    const bondLoop = loops.find(L => L.tags.some(t => t.startsWith("_chem_comp_bond.")));
    if (!atomLoop) return { format: "ligand-cif", atoms: [], bonds: [], meta: { warning: "no chem_comp_atom loop" } };
    const col = {};
    atomLoop.tags.forEach((t, i) => { col[t.replace("_chem_comp_atom.", "")] = i; });
    const nameByIdx = new Map();
    const atoms = [];
    atomLoop.rows.forEach((row, ri) => {
      const a = blankAtom();
      a.name = row[col.atom_id] || "";
      a.elem = elementFromSymbol(row[col.type_symbol] || a.name);
      const cx = row[col.pdbx_model_Cartn_x_ideal] ?? row[col.Model_Cartn_x] ?? row[col.Cartn_x];
      const cy = row[col.pdbx_model_Cartn_y_ideal] ?? row[col.Model_Cartn_y] ?? row[col.Cartn_y];
      const cz = row[col.pdbx_model_Cartn_z_ideal] ?? row[col.Model_Cartn_z] ?? row[col.Cartn_z];
      a.x = parseFloat(cx); a.y = parseFloat(cy); a.z = parseFloat(cz);
      const q = parseFloat(row[col.charge] || row[col.pdbx_charge]); a.charge = isNaN(q) ? null : q;
      a.res = "LIG"; a.resi = 1; a.het = true; a.serial = ri + 1;
      nameByIdx.set(a.name, ri);
      atoms.push(a);
    });
    const bonds = [];
    if (bondLoop) {
      const bc = {};
      bondLoop.tags.forEach((t, i) => { bc[t.replace("_chem_comp_bond.", "")] = i; });
      for (const row of bondLoop.rows) {
        const i = nameByIdx.get(row[bc.atom_id_1]), j = nameByIdx.get(row[bc.atom_id_2]);
        if (i !== undefined && j !== undefined) bonds.push([i, j, row[bc.value_order] || row[bc.value_dist] || "1"]);
      }
    }
    // Some ligand dicts (multi-model X-ray entries) ship no coordinates at all:
    // keep the atoms but flag it, so the UI can explain rather than silently
    // drop them or render a bogus point at the origin.
    const noCoords = atoms.some(a => isNaN(a.x));
    return { format: "ligand-cif", atoms, bonds, meta: { idealCoords: !noCoords, noCoords } };
  }

  /* ============================ XYZ / GRO / CRD =========================== */

  function readXyz(text) {
    const lines = String(text || "").split("\n");
    const n = parseInt((lines[0] || "").trim(), 10);
    if (isNaN(n) || n < 0) return { format: "xyz", atoms: [], error: "bad atom count" };
    const atoms = [];
    for (let i = 0; i < n; i++) {
      const toks = (lines[2 + i] || "").trim().split(/\s+/);
      if (toks.length < 4) return { format: "xyz", atoms, error: "short atom line " + (i + 1) };
      const a = blankAtom();
      a.elem = elementFromSymbol(toks[0]);
      a.x = parseFloat(toks[1]); a.y = parseFloat(toks[2]); a.z = parseFloat(toks[3]);
      if (toks.length >= 5) { const q = parseFloat(toks[4]); if (!isNaN(q)) a.charge = q; }
      a.name = a.elem + (i + 1); a.res = "UNL"; a.resi = 1; a.het = true;
      atoms.push(a);
    }
    return { format: "xyz", atoms, bonds: [], meta: { comment: (lines[1] || "").trim() } };
  }

  function toXyz(atoms, opts) {
    const o = opts || {};
    const out = [String(atoms.length), (o.comment || "DockForge export")];
    for (const a of atoms) {
      const x = a.x == null || isNaN(a.x) ? 0 : a.x;
      const y = a.y == null || isNaN(a.y) ? 0 : a.y;
      const z = a.z == null || isNaN(a.z) ? 0 : a.z;
      out.push(elementFromSymbol(a.elem).padEnd(2, " ") + " " +
        x.toFixed(6).padStart(12, " ") + y.toFixed(6).padStart(12, " ") + z.toFixed(6).padStart(12, " "));
    }
    return out.join("\n") + "\n";
  }

  function readGro(text) {
    const lines = String(text || "").split("\n");
    const natoms = parseInt((lines[1] || "").trim(), 10);
    if (isNaN(natoms) || natoms < 0) return { format: "gro", atoms: [], error: "bad atom count" };
    const atoms = [];
    for (let i = 0; i < natoms; i++) {
      const line = lines[2 + i] || "";
      const a = blankAtom();
      if (line.length >= 44) {
        a.resi = parseInt(line.slice(0, 5), 10) || 1;
        a.res = line.slice(5, 10).trim() || "UNK";
        a.name = line.slice(10, 15).trim();
        a.serial = parseInt(line.slice(15, 20), 10) || i + 1;
        a.x = parseFloat(line.slice(20, 28));
        a.y = parseFloat(line.slice(28, 36));
        a.z = parseFloat(line.slice(36, 44));
      } else {
        const toks = line.trim().split(/\s+/);
        if (toks.length < 6) return { format: "gro", atoms, error: "short atom line " + (i + 1) };
        const m = toks[0].match(/^(\d+)(.*)$/);
        a.resi = m ? parseInt(m[1], 10) : 1;
        a.res = m ? m[2] : toks[0];
        a.name = toks[1]; a.serial = parseInt(toks[2], 10) || i + 1;
        a.x = parseFloat(toks[3]); a.y = parseFloat(toks[4]); a.z = parseFloat(toks[5]);
      }
      // GROMACS stores coordinates in nanometers -> convert to Angstrom
      a.x *= 10; a.y *= 10; a.z *= 10;
      a.elem = elementFromSymbol(a.name.replace(/^[0-9]+/, ""));
      a.res = a.res || "UNK"; a.het = false;
      if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) return { format: "gro", atoms, error: "bad coordinate line " + (i + 1) };
      atoms.push(a);
    }
    // box line may follow (3 or 9 floats), in nm
    const boxLine = (lines[2 + natoms] || "").trim();
    let box = null;
    if (boxLine) {
      const v = boxLine.split(/\s+/).map(parseFloat);
      if (v.length >= 3 && v.every(n2 => !isNaN(n2))) box = v.slice(0, 3).map(n2 => n2 * 10);
    }
    return { format: "gro", atoms, bonds: [], meta: { title: (lines[0] || "").trim(), boxNm: box ? box.map(b => b / 10) : null } };
  }

  function toGro(atoms, opts) {
    const o = opts || {};
    const out = [(o.title || "DockForge export"), String(atoms.length)];
    atoms.forEach((a, i) => {
      const x = (a.x == null || isNaN(a.x) ? 0 : a.x) / 10; // A -> nm
      const y = (a.y == null || isNaN(a.y) ? 0 : a.y) / 10;
      const z = (a.z == null || isNaN(a.z) ? 0 : a.z) / 10;
      out.push(String(a.resi || 1).padStart(5, " ").slice(-5) + String(a.res || "UNK").slice(0, 5).padEnd(5, " ") +
        String(a.name || a.elem + (i + 1)).slice(0, 5).padStart(5, " ") + String(i + 1).padStart(5, " ") +
        x.toFixed(3).padStart(8, " ") + y.toFixed(3).padStart(8, " ") + z.toFixed(3).padStart(8, " "));
    });
    if (o.boxNm) out.push(o.boxNm.map(v => v.toFixed(5).padStart(10, " ")).join(""));
    else if (o.boxA) out.push(o.boxA.map(v => (v / 10).toFixed(5).padStart(10, " ")).join(""));
    return out.join("\n") + "\n";
  }

  // CHARMM CARD coordinates, normal + EXT (layout from VMD write_charmm_crd.tcl)
  function readCrd(text) {
    const lines = String(text || "").split("\n").filter(l => l.trim() !== "");
    const body = lines.filter(l => !l.startsWith("*"));
    if (!body.length) return { format: "crd", atoms: [], error: "no data" };
    const header = body[0] || "";
    const isExt = /\bEXT\b/.test(header);
    const n = parseInt(header.trim(), 10);
    if (isNaN(n)) return { format: "crd", atoms: [], error: "bad atom count" };
    const atoms = [];
    for (let i = 0; i < n; i++) {
      const line = body[1 + i] || "";
      const a = blankAtom();
      if (isExt) {
        a.serial = parseInt(line.slice(0, 10), 10);
        a.resi = parseInt(line.slice(10, 20), 10) || 1;
        a.res = line.slice(22, 30).trim();
        a.name = line.slice(32, 40).trim();
        a.x = parseFloat(line.slice(40, 60));
        a.y = parseFloat(line.slice(60, 80));
        a.z = parseFloat(line.slice(80, 100));
        const seg = line.slice(104, 112).trim();
        if (seg) a.chain = seg;
        a.bfac = parseFloat(line.slice(122, 142)) || 0;
      } else {
        a.serial = parseInt(line.slice(0, 5), 10);
        a.resi = parseInt(line.slice(5, 10), 10) || 1;
        a.res = line.slice(11, 15).trim();
        a.name = line.slice(16, 20).trim();
        a.x = parseFloat(line.slice(20, 30));
        a.y = parseFloat(line.slice(30, 40));
        a.z = parseFloat(line.slice(40, 50));
        const seg = line.slice(51, 55).trim();
        if (seg) a.chain = seg;
        a.bfac = parseFloat(line.slice(62, 72)) || 0;
      }
      a.elem = elementFromSymbol(a.name.replace(/^[0-9]+/, ""));
      a.het = false;
      if (isNaN(a.x) || isNaN(a.y) || isNaN(a.z)) return { format: "crd", atoms, error: "bad atom line " + (i + 1) };
      atoms.push(a);
    }
    return { format: "crd", atoms, bonds: [], meta: { ext: isExt } };
  }

  function toCrd(atoms, opts) {
    const o = opts || {};
    const ext = !!(o.ext || atoms.length > 99999);
    const out = ["* " + (o.title || "CHARMM coordinates from DockForge"), "*"];
    if (ext) {
      out.push(String(atoms.length).padStart(10, " ") + "  EXT");
      atoms.forEach((a, i) => {
        out.push(String(i + 1).padStart(10, " ") + String(a.resi || 1).padStart(10, " ") + "  " +
          String(a.res || "SYS").slice(0, 8).padEnd(8, " ") + "  " +
          String(a.name || a.elem + (i + 1)).slice(0, 8).padEnd(8, " ") +
          (a.x || 0).toFixed(10).padStart(20, " ") + (a.y || 0).toFixed(10).padStart(20, " ") +
          (a.z || 0).toFixed(10).padStart(20, " ") + "  " +
          String(a.chain || "SYS").slice(0, 8).padEnd(8, " ") + "  " +
          String(a.resi || 1).padStart(8, " ") + (a.bfac || 0).toFixed(10).padStart(20, " "));
      });
    } else {
      out.push(String(atoms.length).padStart(5, " "));
      atoms.forEach((a, i) => {
        out.push(String(i + 1).padStart(5, " ") + String(a.resi || 1).padStart(5, " ") + " " +
          String(a.res || "SYS").slice(0, 4).padEnd(4, " ") + " " +
          String(a.name || a.elem + (i + 1)).slice(0, 4).padEnd(4, " ") +
          (a.x || 0).toFixed(5).padStart(10, " ") + (a.y || 0).toFixed(5).padStart(10, " ") +
          (a.z || 0).toFixed(5).padStart(10, " ") + " " +
          String(a.chain || "SYS").slice(0, 4).padEnd(4, " ") + String(a.resi || 1).padStart(4, " ") +
          (a.bfac || 0).toFixed(5).padStart(10, " "));
      });
    }
    return out.join("\n") + "\n";
  }

  /* ================================ PSF =================================== */

  function readPsf(text) {
    const lines = String(text || "").split("\n");
    const atoms = [], bonds = [];
    let section = null, mode = null;
    for (const line of lines) {
      if (line.includes("!NATOM")) { section = "atoms"; mode = null; continue; }
      if (line.includes("!NBOND")) { section = "bonds"; mode = null; continue; }
      if (line.includes("!") || /^\s*$/.test(line)) { if (line.includes("!")) section = null; continue; }
      if (section === "atoms") {
        const toks = line.trim().split(/\s+/);
        // atomnum segid resid resname name atomtype charge mass (8) or
        // atomnum resid resname name atomtype charge mass (7, XPLOR w/o segid)
        const a = blankAtom();
        if (toks.length >= 8) {
          a.serial = parseInt(toks[0], 10); a.chain = toks[1];
          a.resi = parseInt(toks[2], 10) || 1; a.res = toks[3]; a.name = toks[4];
          a.charge = parseFloat(toks[6]);
        } else if (toks.length >= 7) {
          a.serial = parseInt(toks[0], 10);
          a.resi = parseInt(toks[1], 10) || 1; a.res = toks[2]; a.name = toks[3];
          a.charge = parseFloat(toks[5]);
        } else continue;
        a.elem = elementFromSymbol(a.name.replace(/^[0-9]+/, ""));
        a.het = false;
        atoms.push(a);
      } else if (section === "bonds") {
        const toks = line.trim().split(/\s+/).map(v => parseInt(v, 10) - 1);
        for (let k = 0; k + 1 < toks.length; k += 2) {
          if (!isNaN(toks[k]) && !isNaN(toks[k + 1])) bonds.push([toks[k], toks[k + 1]]);
        }
      }
    }
    return { format: "psf", atoms, bonds, meta: {} };
  }

  /* ===================== AutoDock config / GPF / DPF ====================== */

  function readVinaConfig(text) {
    const cfg = {};
    for (const line of String(text || "").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      const num = parseFloat(val);
      cfg[key] = isNaN(num) || val === "" ? val : num;
    }
    return { format: "vina-config", meta: cfg,
             box: (cfg.center_x != null && cfg.size_x != null) ?
               { center: [cfg.center_x, cfg.center_y, cfg.center_z], size: [cfg.size_x, cfg.size_y, cfg.size_z] } : null };
  }

  function writeVinaConfig(cfg) {
    const c = cfg || {};
    const out = ["# AutoDock Vina config (keys per vina.scripps.edu/manual)"];
    if (c.receptor) out.push("receptor = " + c.receptor);
    if (c.ligand) out.push("ligand = " + c.ligand);
    if (c.flex) out.push("flex = " + c.flex);
    if (c.center) ["x", "y", "z"].forEach((ax, i) => { if (c.center[i] != null) out.push("center_" + ax + " = " + c.center[i]); });
    if (c.size) ["x", "y", "z"].forEach((ax, i) => { if (c.size[i] != null) out.push("size_" + ax + " = " + c.size[i]); });
    if (c.exhaustiveness != null) out.push("exhaustiveness = " + c.exhaustiveness);
    if (c.num_modes != null) out.push("num_modes = " + c.num_modes);
    if (c.energy_range != null) out.push("energy_range = " + c.energy_range);
    if (c.seed != null) out.push("seed = " + c.seed);
    if (c.cpu != null) out.push("cpu = " + c.cpu);
    return out.join("\n") + "\n";
  }

  // Generic keyword parser for AutoDock GPF / DPF keyword files
  function parseKeywordFile(text) {
    const kv = {}; const order = [];
    for (const line of String(text || "").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const toks = t.split(/\s+/);
      const key = toks[0].toLowerCase();
      const val = toks.slice(1);
      if (!(key in kv)) { order.push(key); kv[key] = val.length === 1 ? val[0] : val; }
      else if (Array.isArray(kv[key])) kv[key].push(val.length === 1 ? val[0] : val);
    }
    return { keys: kv, order };
  }

  function readGpf(text) {
    const { keys } = parseKeywordFile(text);
    const npts = Array.isArray(keys.npts) ? keys.npts.map(Number) : null;
    const spacing = keys.spacing != null && !Array.isArray(keys.spacing) ? parseFloat(keys.spacing) : null;
    const center = Array.isArray(keys.gridcenter) ? keys.gridcenter.map(Number) : null;
    const types = typeof keys.ligand_types === "string" ? keys.ligand_types.split(/\s+|(?=[A-Z])/).filter(Boolean) : (keys.ligand_types || null);
    return { format: "gpf", meta: { ...keys, npts, spacing, center, ligand_types: types },
             grid: npts && spacing ? { npts, spacing } : null };
  }

  function writeGpf(g) {
    const o = g || {};
    const out = [];
    const npts = o.npts || [60, 60, 60];
    const sp = o.spacing != null ? o.spacing : 0.375;
    out.push("npts " + npts.join(" "));
    out.push("spacing " + sp);
    out.push("gridfld " + (o.gridfld || "receptor.maps.fld"));
    out.push("spacing " + sp);
    out.push("ligand_types " + (o.types || ["A", "C", "N", "OA", "SA", "HD"]).join(" "));
    out.push("receptor " + (o.receptor || "receptor.pdbqt"));
    if (o.center) out.push("gridcenter " + o.center.map(v => v.toFixed(3)).join(" "));
    (o.types || ["A", "C", "N", "OA", "SA", "HD"]).forEach(t => out.push("map receptor." + t + ".map"));
    out.push("elecmap receptor.e.map");
    out.push("dsolvmap receptor.d.map");
    out.push("dielectric " + (o.dielectric != null ? o.dielectric : -0.1465));
    return out.join("\n") + "\n";
  }

  function readDpf(text) {
    const { keys, order } = parseKeywordFile(text);
    return { format: "dpf", meta: keys, keywords: order };
  }

  /* ============================ HDOCK / ChimeraX ========================== */

  function readHdockOut(text) {
    const t = String(text || "");
    const scores = [], rmsds = [];
    for (const line of t.split("\n")) {
      if (/Docking score/i.test(line)) {
        const nums = line.replace(/[^-\d.\s]/g, " ").trim().split(/\s+/).filter(s => /^-?\d/.test(s)).map(parseFloat);
        nums.forEach(v => { if (!isNaN(v)) scores.push(v); });
      }
      if (/Ligand rmsd/i.test(line)) {
        const nums = line.replace(/[^-\d.\s]/g, " ").trim().split(/\s+/).filter(s => /^-?\d/.test(s)).map(parseFloat);
        nums.forEach(v => { if (!isNaN(v)) rmsds.push(v); });
      }
    }
    const n = Math.max(scores.length, rmsds.length);
    const models = [];
    for (let i = 0; i < n; i++) models.push({ rank: i + 1, score: scores[i], ligandRmsd: rmsds[i] });
    return { format: "hdock-out", models, meta: { count: models.length } };
  }

  function readCxc(text) {
    const opens = [], afFetches = [], commands = [];
    for (const raw of String(text || "").split("\n")) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      const toks = line.split(/\s+/);
      commands.push({ cmd: toks[0], args: toks.slice(1) });
      if (toks[0] === "open") opens.push(toks.slice(1).join(" "));
      if (toks[0] === "alphafold" && toks[1] === "fetch") afFetches.push(toks[2] || "");
    }
    return { format: "cxc", meta: { opens, afFetches }, commands };
  }

  /* ============================ unified entry ============================= */

  // Read any supported coordinate/structure file into normalized atoms.
  function readAny(name, text) {
    const fmt = detectFormat(name, text);
    try {
      switch (fmt) {
        case "pdb": return readPdb(text);
        case "pdbqt": return readPdbqt(text);
        case "sdf": return readSdf(text);
        case "mol2": return readMol2(text);
        case "mmcif": return readMmcif(text);
        case "ligand-cif": return readLigandCif(text);
        case "xyz": return readXyz(text);
        case "gro": return readGro(text);
        case "crd": return readCrd(text);
        case "psf": return readPsf(text);
        case "vina-config": return readVinaConfig(text);
        case "gpf": return readGpf(text);
        case "dpf": return readDpf(text);
        case "hdock-out": return readHdockOut(text);
        case "cxc": return readCxc(text);
        default: return { format: fmt, atoms: [], meta: { warning: "recognized but not parsed: " + fmt } };
      }
    } catch (e) {
      return { format: fmt, atoms: [], error: "parse failed: " + e.message };
    }
  }

  // Export in any supported writer format from normalized atoms.
  function writeAny(fmt, atoms, opts) {
    switch (fmt) {
      case "pdb": return toPdb(atoms, opts);
      case "pdbqt": return toPdbqt(atoms, opts);
      case "sdf": return toSdf(atoms, opts);
      case "mol2": return toMol2(atoms, opts);
      case "xyz": return toXyz(atoms, opts);
      case "gro": return toGro(atoms, opts);
      case "crd": return toCrd(atoms, opts);
      case "vina-config": return writeVinaConfig(opts && opts.cfg ? opts.cfg : opts);
      case "gpf": return writeGpf(opts && opts.grid ? opts.grid : opts);
      default: return null;
    }
  }

  const SUPPORTED = {
    read: ["pdb", "pdbqt", "sdf", "mol2", "mmcif", "ligand-cif", "xyz", "gro", "crd", "psf",
           "vina-config", "gpf", "dpf", "hdock-out", "cxc", "lammps (recognized)", "insightii (recognized)"],
    write: ["pdb", "pdbqt", "sdf", "mol2", "xyz", "gro", "crd", "vina-config", "gpf"]
  };

  global.DFFormats = {
    detectFormat, readAny, writeAny, SUPPORTED,
    readPdb, readPdbqt, readSdf, readSdfRecord, splitSdfRecords, readMol2,
    readMmcif, readLigandCif, parseCifLoops, tokenizeCifLine,
    readXyz, readGro, readCrd, readPsf,
    readVinaConfig, writeVinaConfig, readGpf, writeGpf, readDpf, parseKeywordFile,
    readHdockOut, readCxc, plddtFromAtoms,
    toPdb, toPdbqt, toSdf, toMol2, toXyz, toGro, toCrd,
    elementFromSymbol, fmtAtomName
  };
})(typeof window !== "undefined" ? window : globalThis);
