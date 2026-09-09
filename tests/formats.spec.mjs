/* Format library test suite — run with: node --test tests/formats.spec.mjs
   Fixtures are real files (RCSB, PubChem, AlphaFold DB, Webina benchmarks,
   OpenBabel test suite) plus spec-derived synthetics. Each fixture's provenance
   is documented in tests/fixtures/PROVENANCE.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");

function loadLib(relPath) {
  const src = readFileSync(path.join(__dirname, "..", relPath), "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.DFFormats || (typeof globalThis.DFFormats !== "undefined" ? globalThis.DFFormats : undefined);
}

const F = loadLib("docs/assets/formats.js");
assert.ok(F, "DFFormats failed to load");

const fx = f => readFileSync(path.join(FIX, f), "utf8");

/* ---------------- detection against every real fixture ---------------- */

test("detectFormat: correct verdict for every fixture", () => {
  const cases = {
    "121d.pdb": "pdb", "1bna.cif": "mmcif", "ligand_NT.cif": "ligand-cif",
    "netropsin_3d.sdf": "sdf", "1iep_ligand.sdf": "sdf",
    "AF-P69905-F1-model_v6.pdb": "pdb", "2P16_ligand_apixaban.pdbqt": "pdbqt",
    "2P16_receptor_factorXa.pdbqt": "pdbqt", "mol24.mol2": "mol2",
    "vina_config.txt": "vina-config", "receptor.gpf": "gpf", "hdock.out": "hdock-out",
    "analysis.cxc": "cxc", "sample.gro": "gro", "sample.crd": "crd", "sample_ext.crd": "crd"
  };
  for (const [f, exp] of Object.entries(cases)) {
    assert.equal(F.detectFormat(f, fx(f)), exp, `detect ${f}`);
  }
});

/* ---------------- PDB / PDBQT ---------------- */

test("PDB: 121d parse — atoms, waters, CONECT bonds", () => {
  const r = F.readPdb(fx("121d.pdb"));
  assert.equal(r.atoms.length, 564);
  assert.ok(r.atoms.some(a => a.res === "HOH"), "has waters");
  const nt = r.atoms.filter(a => a.res === "NT");
  assert.equal(nt.length, 31, "netropsin 31 atoms");
  assert.equal(nt[0].elem, "C");
  assert.ok(r.bonds.length >= 31, "CONECT bonds resolved (>=31)");
});

test("PDBQT: real Webina ligand — charge + AD type + torsion tree", () => {
  const r = F.readPdbqt(fx("2P16_ligand_apixaban.pdbqt"));
  assert.equal(r.atoms.length, 36);
  assert.equal(r.atoms[0].name, "N1");
  assert.equal(r.atoms[0].adtype, "N");
  assert.equal(r.atoms[0].elem, "N");
  const oa = r.atoms.find(a => a.adtype === "OA");
  assert.ok(oa, "has OA type");
  assert.equal(oa.elem, "O", "OA maps to O");
  assert.ok(typeof r.atoms[0].charge === "number", "charge parsed");
  // atom line column check: charge in 71-76, type in 78-79
  const line = fx("2P16_ligand_apixaban.pdbqt").split("\n").find(l => l.startsWith("HETATM"));
  assert.equal(line.slice(70, 76).trim(), "-0.227");
  assert.equal(line.slice(77, 79).trim(), "N");
});

test("PDBQT: receptor (large rigid file) parses; AD type 'A' maps to carbon", () =>  {
  const r = F.readPdbqt(fx("2P16_receptor_factorXa.pdbqt"));
  assert.equal(r.atoms.length, 2768);
  assert.ok(r.atoms.every(a => a.charge !== null && !isNaN(a.charge)), "charges present");
  const aromatic = r.atoms.find(a => a.adtype === "A");
  assert.ok(aromatic, "has aromatic carbon type A");
  assert.equal(aromatic.elem, "C");
});

test("Vina multi-model output: models, per-model scores, per-model atoms", () => {
  const vout = [
    "MODEL 1", "REMARK VINA RESULT:    -7.3      0.000      0.000",
    "ROOT", "HETATM    1  N1  UNL     1      -3.723  -1.369   0.055  1.00  0.00    -0.227 N ",
    "ENDROOT", "TORSDOF 5", "ENDMDL",
    "MODEL 2", "REMARK VINA RESULT:    -6.9      1.234      1.876",
    "ROOT", "HETATM    1  N1  UNL     1       3.723   1.369   1.055  1.00  0.00    -0.227 N ",
    "ENDROOT", "TORSDOF 5", "ENDMDL", "END"
  ].join("\n");
  const r = F.readPdbqt(vout);
  assert.equal(r.meta.multiModel, true);
  assert.equal(r.models.length, 2);
  assert.equal(r.scores.length, 2);
  assert.equal(r.scores[0].score, -7.3);
  assert.equal(r.scores[0].rmsd_lb, 0.000);
  assert.equal(r.scores[1].rmsd_ub, 1.876);
});

test("AlphaFold: pLDDT lives in B-factor column (AFDB FAQ)", () => {
  const r = F.readPdb(fx("AF-P69905-F1-model_v6.pdb"));
  assert.equal(r.atoms.length, 1077);
  const plddt = F.plddtFromAtoms(r.atoms);
  assert.ok(plddt.length >= 141, "one row per residue of hemoglobin alpha (141 aa)");
  const first = plddt.find(p => p.resi === 1);
  assert.ok(first.plddt > 0 && first.plddt <= 100, "pLDDT in 0..100, got " + first.plddt);
});

/* ---------------- SDF ---------------- */

test("SDF V2000: real PubChem netropsin (57 atoms, 58 bonds)", () => {
  const r = F.readSdf(fx("netropsin_3d.sdf"));
  assert.equal(r.records.length, 1);
  assert.equal(r.atoms.length, 57);
  assert.ok(r.bonds.length >= 58, "bond table parsed");
  const elements = new Set(r.atoms.map(a => a.elem));
  assert.ok(elements.has("N") && elements.has("O") && elements.has("C"), "C/N/O present");
});

test("SDF V2000: RDKit record from Vina repo (STI, 69 atoms)", () => {
  const r = F.readSdf(fx("1iep_ligand.sdf"));
  assert.equal(r.atoms.length, 69);
  assert.ok(r.bonds.length >= 73, "73 bonds parsed");
});

test("SDF writer: coordinates round-trip at 4 decimals; counts line format", () => {
  const r = F.readSdf(fx("netropsin_3d.sdf"));
  const out = F.toSdf(r.atoms, { bonds: r.bonds, title: "roundtrip" });
  const r2 = F.readSdf(out);
  assert.equal(r2.atoms.length, r.atoms.length);
  assert.equal(r2.bonds.length, r.bonds.length);
  for (let i = 0; i < r.atoms.length; i++) {
    for (const ax of ["x", "y", "z"]) {
      assert.ok(Math.abs(r.atoms[i][ax] - r2.atoms[i][ax]) < 5e-5, `coord ${ax} atom ${i}`);
    }
    assert.equal(r.atoms[i].elem, r2.atoms[i].elem);
  }
  // V2000 counts line: atom+bond counts up front, "999 V2000" at the end
  const counts = out.split("\n")[3];
  assert.ok(/^\s{0,3}\d{1,3}\s{0,3}\d{1,3}(\s+0)*\s*0999 V2000$/.test(counts), "counts line: " + JSON.stringify(counts));
});

/* ---------------- MOL2 ---------------- */

test("MOL2: real OpenBabel fixture (41 atoms) + charge column", () => {
  const r = F.readMol2(fx("mol24.mol2"));
  assert.equal(r.atoms.length, 41);
  assert.ok(r.bonds.length >= 43, "bond table parsed");
  const mt = r.atoms.find(a => a.adtype === "C.ar");
  assert.ok(mt, "TRIPOS types preserved");
  assert.equal(mt.elem, "C");
  assert.equal(r.atoms[0].charge, 0);
});

test("MOL2 writer: round-trip coordinates and TRIPOS types", () => {
  const r = F.readMol2(fx("mol24.mol2"));
  const out = F.toMol2(r.atoms, { bonds: r.bonds, title: "rt" });
  const r2 = F.readMol2(out);
  assert.equal(r2.atoms.length, 41);
  for (let i = 0; i < 41; i++) {
    assert.ok(Math.abs(r.atoms[i].x - r2.atoms[i].x) < 5e-5);
    assert.ok(Math.abs(r.atoms[i].y - r2.atoms[i].y) < 5e-5);
    assert.ok(Math.abs(r.atoms[i].z - r2.atoms[i].z) < 5e-5);
  }
  assert.ok(r2.atoms.some(a => a.adtype === "C.ar"), "TRIPOS type survives round-trip");
});

/* ---------------- mmCIF + ligand CIF ---------------- */

test("mmCIF: real RCSB 1BNA (566 atoms incl waters), auth chain + seq ids", () =>  {
  const r = F.readMmcif(fx("1bna.cif"));
  assert.equal(r.atoms.length, 566);
  assert.ok(r.atoms.some(a => a.res === "HOH"), "waters kept");
  const dc = r.atoms.find(a => a.res === "DC" && a.name === "N9" ? false : a.res === "DC" && a.name === "C1'") ;
  assert.ok(dc, "deoxycytidine atom with prime name");
  const hoh = r.atoms.find(a => a.res === "HOH");
  assert.equal(hoh.het, true, "waters are HETATM");
  assert.ok(r.atoms.some(a => a.elem === "P"), "phosphorus elements parsed");
});

test("Ligand CIF: netropsin NT dictionary — atoms, bonds, charges, ideal coords", () => {
  const r = F.readLigandCif(fx("ligand_NT.cif"));
  assert.equal(r.atoms.length, 57);
  // real NT.cif ships 58 chem_comp_bond rows
  assert.equal(r.bonds.length, 58);
  assert.equal(r.meta.idealCoords, true);
  const n1 = r.atoms.find(a => a.name === "N1");
  assert.ok(n1, "atom N1 present");
  assert.equal(n1.elem, "N");
  assert.ok(n1.charge !== null, "charge parsed from chem_comp_atom");
  // coordinates come from pdbx_model_Cartn_*_ideal (geometry-idealized); they
  // legitimately differ from the 121D crystal positions — only sanity-check them
  assert.ok(!isNaN(n1.x) && !isNaN(n1.y) && !isNaN(n1.z), "ideal coords present");
  assert.ok(Math.abs(n1.x) < 100 && Math.abs(n1.y) < 100 && Math.abs(n1.z) < 100, "coords in sane range");
});

test("CIF tokenizer: quotes and # comments", () => {
  const toks = F.tokenizeCifLine(`_x  'hello world'  "two words"  12 # trailing comment`);
  // compare as JSON: tokens come from the vm realm, deepEqual sees a different Array prototype
  assert.equal(JSON.stringify(toks.slice(1)), JSON.stringify(["hello world", "two words", "12"]));
});

/* ---------------- XYZ / GRO ---------------- */

test("XYZ: parse + writer round-trip", () => {
  const xyz = ["3", "test molecule", "O    0.000   0.000   0.000", "H    0.960   0.000   0.000", "H   -0.240   0.930   0.000"].join("\n");
  const r = F.readXyz(xyz);
  assert.equal(r.atoms.length, 3);
  assert.equal(r.atoms[0].elem, "O");
  const out = F.toXyz(r.atoms, { comment: "rt" });
  const r2 = F.readXyz(out);
  assert.equal(r2.atoms.length, 3);
  assert.ok(Math.abs(r2.atoms[1].x - 0.96) < 1e-6);
});

test("GRO: nm→Å conversion, fixed-column and whitespace fallback", () => {
  const r = F.readGro(fx("sample.gro"));
  assert.equal(r.atoms.length, 5);
  assert.ok(Math.abs(r.atoms[0].x - 10.23) < 1e-6, "1.023 nm = 10.23 Å, got " + r.atoms[0].x);
  assert.equal(r.atoms[0].res, "ALA");
  const out = F.toGro(r.atoms, { title: "rt", boxA: [20, 20, 20] });
  const r2 = F.readGro(out);
  assert.equal(r2.atoms.length, 5);
  assert.ok(Math.abs(r2.atoms[3].x - 8.16) < 1e-2, "Å→nm→Å within 3-dec precision");
  assert.equal(r2.meta.boxNm[0], 2, "box in nm");
});

/* ---------------- CHARMM CRD + PSF ---------------- */

test("CHARMM CRD normal: parse + write round-trip", () => {
  const r = F.readCrd(fx("sample.crd"));
  assert.equal(r.atoms.length, 5);
  assert.equal(r.meta.ext, false);
  assert.equal(r.atoms[1].name, "CA");
  assert.ok(Math.abs(r.atoms[0].x - 1.023) < 1e-4, "x parsed, got " + r.atoms[0].x);
  const out = F.toCrd(r.atoms, { title: "rt" });
  const r2 = F.readCrd(out);
  assert.equal(r2.atoms.length, 5);
  assert.ok(Math.abs(r2.atoms[4].z - 0.176) < 5e-5, "5-dec round-trip");
  assert.equal(r2.meta.ext, false);
});

test("CHARMM CRD EXT: parse + write round-trip", () => {
  const r = F.readCrd(fx("sample_ext.crd"));
  assert.equal(r.atoms.length, 5);
  assert.equal(r.meta.ext, true);
  assert.ok(Math.abs(r.atoms[0].x - 1.023) < 1e-9);
  const out = F.toCrd(r.atoms, { ext: true, title: "rt" });
  const r2 = F.readCrd(out);
  assert.equal(r2.meta.ext, true);
  assert.ok(Math.abs(r2.atoms[0].x - 1.023) < 1e-9, "10-dec round-trip");
});

test("PSF: atoms + bond sections", () => {
  const psf = [
    "PSF NAMD",
    "       3 !NTITLE",
    "remarks",
    "",
    "       5 !NATOM",
    "1 SYS   1  ALA  N    NH1  -0.3  14.01",
    "2 SYS   1  ALA  CA   CT1   0.1  12.01",
    "3 SYS   1  ALA  C    C     0.3  12.01",
    "4 SYS   1  ALA  O    O    -0.3  16.00",
    "5 SYS   1  ALA  CB   CT1   0.0  12.01",
    "",
    "       2 !NBOND: bonds",
    "1      2",
    "2      3",
    ""
  ].join("\n");
  const r = F.readPsf(psf);
  assert.equal(r.atoms.length, 5);
  assert.equal(r.atoms[1].name, "CA");
  assert.equal(r.atoms[0].charge, -0.3);
  assert.equal(r.bonds.length, 2);
});

/* ---------------- Vina config / GPF / DPF ---------------- */

test("Vina config: box, numeric coercion, comments ignored", () => {
  const r = F.readVinaConfig(fx("vina_config.txt"));
  assert.equal(JSON.stringify(r.box.center), JSON.stringify([2, 6, -7]));
  assert.equal(JSON.stringify(r.box.size), JSON.stringify([25, 25, 25]));
  assert.equal(r.meta.exhaustiveness, 8);
  assert.equal(r.meta.ligand, "ligand.pdbqt");
  const out = F.writeVinaConfig({ receptor: "rec.pdbqt", ligand: "lig.pdbqt",
    center: [10.8, 22.6, 72.7], size: [16.6, 17.3, 26.7], exhaustiveness: 8 });
  const r2 = F.readVinaConfig(out);
  assert.equal(JSON.stringify(r2.box.center), JSON.stringify([10.8, 22.6, 72.7]));
  assert.equal(r2.meta.exhaustiveness, 8);
});

test("GPF: grid parameters from real AutoDock keywords", () => {
  const r = F.readGpf(fx("receptor.gpf"));
  assert.equal(JSON.stringify(r.grid.npts), JSON.stringify([60, 60, 60]));
  assert.equal(r.grid.spacing, 0.375);
  assert.equal(JSON.stringify(r.meta.center), JSON.stringify([2, 6, -7]));
  assert.ok(r.meta.ligand_types.includes("OA"));
  const out = F.writeGpf({ npts: [40, 40, 40], center: [1, 2, 3], types: ["A", "C", "HD"] });
  const r2 = F.readGpf(out);
  assert.equal(JSON.stringify(r2.grid.npts), JSON.stringify([40, 40, 40]));
  assert.ok(r2.meta.ligand_types.includes("HD"));
});

test("DPF: keyword parsing", () => {
  const dpf = ["outlev 1", "move lig.pdbqt", "map rec.A.map", "rmstol 2.0", ""].join("\n");
  const r = F.readDpf(dpf);
  assert.equal(r.meta.outlev, "1");
  assert.equal(r.meta.move, "lig.pdbqt");
  assert.equal(r.meta.rmstol, "2.0");
});

/* ---------------- HDOCK + ChimeraX ---------------- */

test("HDOCK output: ranks, docking scores, ligand RMSDs", () => {
  const r = F.readHdockOut(fx("hdock.out"));
  assert.equal(r.models.length, 5);
  assert.equal(r.models[0].score, -444.95);
  assert.equal(r.models[0].ligandRmsd, 0.42);
  assert.equal(r.models[4].rank, 5);
});

test("ChimeraX cxc: open + alphafold fetch commands", () => {
  const r = F.readCxc(fx("analysis.cxc"));
  assert.ok(r.meta.opens.length >= 2);
  assert.equal(r.meta.afFetches[0], "P69905");
  assert.ok(r.commands.some(c => c.cmd === "color"));
});

/* ---------------- unified entry points ---------------- */

test("readAny routes all formats; writeAny produces parseable output", () => {
  const cases = [
    ["a.pdb", fx("121d.pdb")], ["a.pdbqt", fx("2P16_ligand_apixaban.pdbqt")],
    ["a.sdf", fx("netropsin_3d.sdf")], ["a.mol2", fx("mol24.mol2")],
    ["a.cif", fx("1bna.cif")], ["a.cif", fx("ligand_NT.cif")],
    ["a.xyz", ["2", "hi", "O 0 0 0", "H 1 0 0", ""].join("\n")], ["a.gro", fx("sample.gro")],
    ["a.crd", fx("sample.crd")], ["a.txt", fx("vina_config.txt")],
    ["a.gpf", fx("receptor.gpf")], ["a.out", fx("hdock.out")], ["a.cxc", fx("analysis.cxc")]
  ];
  for (const [name, text] of cases) {
    const r = F.readAny(name, text);
    assert.ok(!r.error, `${name}: ${r.error || "ok"}`);
    assert.ok(r.format !== "unknown", `${name} detected`);
  }
  const atoms = [
    { name: "N1", res: "UNL", resi: 1, chain: "A", x: 1.5, y: 2.25, z: -3.75, elem: "N", charge: -0.2, adtype: "NA", het: true },
    { name: "C2", res: "UNL", resi: 1, chain: "A", x: 2.5, y: 3.25, z: -4.75, elem: "C", charge: 0.1, adtype: "A", het: true }
  ];
  for (const fmt of ["pdb", "pdbqt", "sdf", "mol2", "xyz", "gro", "crd"]) {
    const text = F.writeAny(fmt, atoms);
    assert.ok(text && text.length > 10, `write ${fmt}`);
    const r = F.readAny(`out.${fmt}`, text);
    assert.ok(!r.error, `write→read ${fmt}: ${r.error || "ok"}`);
    assert.equal(r.atoms.length, 2, `round-trip count ${fmt}`);
    assert.ok(Math.abs(r.atoms[0].x - 1.5) < 5e-3, `round-trip coord ${fmt}`);
  }
  // writers for grid formats
  assert.ok(F.writeAny("vina-config", [], { cfg: { center: [1, 2, 3], size: [10, 10, 10] } }));
  assert.ok(F.writeAny("gpf", [], { grid: { center: [1, 2, 3] } }));
});

/* ---------------- negative / garbage tests ---------------- */

test("garbage and empty inputs never throw, return errors or empty results", () => {
  const garbages = ["", "   \\n\\n", "total nonsense text", "������", "{}", "12345", "ATOM  ", "HETATMxx"];
  for (const g of garbages) {
    assert.doesNotThrow(() => {
      const r = F.readAny("x.txt", g);
      assert.ok(r && typeof r === "object");
    });
  }
  assert.equal(F.readAny("x.pdb", "not a pdb").atoms.length, 0);
  assert.equal(F.readAny("x.sdf", "x\\ny\\nz\\nshort").atoms.length, 0);
  const badCif = "data_x\\nloop_\\n_a\\n_b\\n1\\n";
  assert.doesNotThrow(() => F.readAny("x.cif", badCif));
  const truncated = fx("2P16_ligand_apixaban.pdbqt").slice(0, 500);
  assert.doesNotThrow(() => F.readAny("x.pdbqt", truncated));
});

test("detectFormat never returns undefined for any input", () => {
  for (const s of ["", "junk", "ATOM 1", "data_", "@<TRIPOS>", "*\\n5", "ITEM: TIMESTEP"]) {
    const d = F.detectFormat("f", s);
    assert.ok(typeof d === "string" && d.length > 0);
  }
});

test("all fixture files in the directory are recognized", () => {
  const files = readdirSync(FIX);
  for (const f of files) {
    if (f === "PROVENANCE.md" || f.endsWith(".md")) continue;
    const text = readFileSync(path.join(FIX, f), "utf8");
    const d = F.detectFormat(f, text);
    assert.ok(d !== "unknown", `${f} unrecognized`);
  }
});

test("every exported reader exists and is a function", () => {
  for (const fn of ["readPdb", "readPdbqt", "readSdf", "readMol2", "readMmcif", "readLigandCif",
                    "readXyz", "readGro", "readCrd", "readPsf", "readVinaConfig", "readGpf",
                    "readDpf", "readHdockOut", "readCxc", "detectFormat", "readAny", "writeAny"]) {
    assert.equal(typeof F[fn], "function", fn);
  }
});
