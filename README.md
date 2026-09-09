# DockForge 🧬

**Learn molecular docking by doing it — in your browser.**
[![GitHub Pages](https://img.shields.io/badge/live-dockforge--app-yellow)](https://cliffvale.github.io/dockforge-app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![engine](https://img.shields.io/badge/engine-Webina%20(Vina%20WASM)-informational)](https://durrantlab.pitt.edu/webina/)

DockForge is a free, beginner-friendly, zero-install introduction to molecular docking:
a 7-lesson course, a plain-English glossary, and an interactive **Docking Lab** where a real
AutoDock Vina engine (compiled to WebAssembly as **Webina**) runs docking entirely on the visitor's device.

## ✨ What's inside

| Section | What you get |
|---|---|
| 📖 **Course** (`docs/course.html`) | 7 lessons: docking basics → proteins & ligands → pockets → poses & scores → PDBQT prep → grid boxes → reading results. Checkpoint quizzes + local progress tracking. |
| ⚗️ **Docking Lab** (`docs/lab.html`) | Example kits (DNA dodecamer + netropsin, 121D, with computed grid box; apo 1BNA), a click-by-click Webina walkthrough, guided steps, and the embedded Webina app. |
| 🔬 **Live Preview** (`docs/preview.html`) | Drop **any** docking file — detected, parsed and rendered instantly: PDB · PDBQT · SDF/MOL · MOL2 · mmCIF · ligand CIF · XYZ · GRO · CHARMM CRD/PSF · AlphaFold models (pLDDT-colored) · Vina configs & outputs · AutoDock GPF/DPF · HDOCK results · ChimeraX scripts. One-click re-export to 7 formats. |
| 📊 **Result Viewer** (`docs/results.html`) | Drag-and-drop Webina output: pose table parsed from `REMARK VINA RESULT`, interactive 3D (3Dmol.js), pocket residues (≤4 Å rule), heuristic H-bond lines, CSV export. |
| 🔤 **Glossary** (`docs/glossary.html`) | 40 jargon terms, searchable. |
| 📁 `docs/assets/` | Bundled structures: 121D/1BNA PDBs, DNA-receptor-only and netropsin-ligand-only PDBs, PDBe binding-site snapshot, plus preview samples (AlphaFold P69905, apixaban PDBQT, MOL2, netropsin SDF). |
| 🧪 `tests/` | 51-test Node suite (`node --test tests/tools.spec.mjs tests/formats.spec.mjs`) validating every reader/writer against **real fixture files** (provenance in `tests/fixtures/PROVENANCE.md`): RCSB mmCIF + ligand CIF, PubChem SDF, Webina benchmark PDBQTs, AlphaFold DB model, OpenBabel MOL2, plus spec-derived GRO/CRD/GPF/DPF/Vina-config/HDOCK fixtures. |

## 🧬 Format compatibility

`docs/assets/formats.js` reads and writes the file types of the docking ecosystem — every layout taken
from a verified primary source (wwPDB spec, real Webina/OpenBabel/RCSB/AlphaFold files, VMD's CHARMM
writer, DeepMind's AlphaFold source, vina.scripps.edu manual) and tested against real files:

| | Formats |
|---|---|
| **Read** | PDB, PDBQT (incl. multi-model Vina output + torsion trees), SDF/MOL (V2000 + V3000 subset), MOL2, mmCIF, RCSB ligand CIF, XYZ, GRO (nm→Å), CHARMM CRD (normal + EXT), PSF, AlphaFold models (pLDDT from B-factors), Vina config, AutoDock GPF/DPF, HDOCK results, ChimeraX `.cxc` |
| **Write** | PDB, PDBQT, SDF, MOL2, XYZ, GRO, CHARMM CRD, Vina config, AutoDock GPF |
| **Recognized** | LAMMPS trajectories, InsightII (detected, parse planned) |

AlphaFold pLDDT band cut-offs (90/70/50) come from DeepMind's `alphafold/common/confidence.py`;
rendering colors follow the AFDB legend. Writers emit only what each format can honestly carry.

**Column-exact, doc-verified output.** Every PDB/PDBQT/SDF line the writers emit was checked field-by-field
against the official specs — wwPDB v3.3 (name cols 13–16, altLoc 17, iCode 27, charge 71–76 / element 77–78
for PDBQT) and the BIOVIA CTfile spec (MDL charge codes at cols 37–39, `M  CHG` property lines for charges
beyond ±3) — and round-tripped against real files, so external fixed-column tools (Vina, ChimeraX, 3Dmol,
OpenBabel) parse our exports correctly. The ligand's bond table (from SDF/MOL2/CIF) travels through as
CONECT records when poses are shown in the viewer — real chemistry, not distance guesses.

## 🔎 Structure Finder

One page — <a href="docs/find.html">docs/find.html</a> — wires three real, live, public APIs
into the beginner flow so you never leave the site to locate a target or ligand:

- **RCSB Protein Data Bank** — full-text search via the
  <a href="https://search.rcsb.org" target="_blank" rel="noopener">Search API</a> (assemblies → PDB IDs),
  metadata from the <a href="https://data.rcsb.org" target="_blank" rel="noopener">Data API</a>,
  and coordinate files from <a href="https://files.rcsb.org" target="_blank" rel="noopener">files.rcsb.org</a>.
- **PubChem** — by **name**, by **CID**, or by **SMILES** via the
  <a href="https://pubchem.ncbi.nlm.nih.gov/rest/pug" target="_blank" rel="noopener">PUG-REST API</a>,
  with 3D SDF (`record_type=3d`) whenever PubChem has coordinates.
- **Exact match** — type a bare PDB ID (e.g. `1BNA`) or CID (e.g. `4461`) for a direct fetch.

Each search returns a metadata card (IUPAC name, InChIKey, SMILES, formula, XLogP3, exact mass),
plus <b>Copy</b>, <b>Open in the lab</b> and <b>Open in the viewer</b> actions.

## 🎨 UI/UX system

The interface was rebuilt on ideas adapted from four flagship UI projects ( studied for their patterns,
not imported as dependencies — the site stays zero-build, zero-framework):

- **[ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro)** → ProLayout shell: grouped
  sidebar navigation (Start here / Work), PageContainer-style page headers with breadcrumbs and
  descriptions, consistent nav across pages.
- **[shadcn/ui](https://github.com/shadcn-ui/ui)** → semantic design-token CSS (`--card`, `--primary`,
  `--ring`, `--radius`…) with a one-click **light/dark theme** (persisted), focus rings, and consistent
  card/badge/button primitives.
- **[shadcn-ui/taxonomy](https://github.com/shadcn-ui/taxonomy)** → a **⌘K command palette** on every page
  for instant navigation and actions (open file, toggle theme), keyboard-first interaction.
- **[tremorlabs/tremor](https://github.com/tremorlabs/tremor)** → KPI stat cards and clean bar-chart
  summaries on the home page (pure CSS/SVG — no chart library).

## 🚀 Run it

**Live:** https://cliffvale.github.io/dockforge-app/ (after Pages is enabled — Settings → Pages → deploy from `docs/` folder, main branch)

**Locally:**
```bash
git clone https://github.com/CliffVale/dockforge-app.git
cd dockforge-app/docs
python3 -m http.server 8000
# open http://localhost:8000
```
(For the embedded Webina frame, serve over http://localhost — Webina itself needs no build step.)

## 🧪 The science, honestly

- The docking engine is [Webina](https://durrantlab.pitt.edu/webina/) (Durrant Lab, Apache-2.0) — Vina in your browser.
  Browser docking is **for learning**: limited exhaustiveness, minimal receptor preparation (Webina's converter does
  H-bond-capability perception, not full protonation), and no pose validation.
- Research-grade automation (full prep → pocket prediction → docking → interaction reports) is the
  [project roadmap](#-roadmap); see `research/` notes in the upstream workspace and the analysis in this repo's `docs/`.
- Example structures are from the [RCSB PDB](https://www.rcsb.org): 121D (DNA dodecamer + minor-groove drug netropsin) and 1BNA (B-DNA dodecamer).
- **Health disclaimer:** docking scores are hypotheses, not medical guidance.

## 🗺 Roadmap

- [ ] `v0.1` — beginner site: course, glossary, lab (Webina), result viewer ← **you are here**
- [ ] `v0.2` — pipeline core: PDBFixer + Meeko receptor prep, RDKit/Gypsum-DL ligand prep, P2Rank auto-pocket, EasyDock-style orchestration, PLIP-style interaction reports
- [ ] `v0.3` — self-hostable server mode (Streamlit) for real virtual screening
- [ ] `v0.4` — aptamer ensemble mode (APTAMD-style conformer sets) for protein–aptamer docking
- [x] **Structure Finder** — RCSB + PubChem (name/CID/SMILES) live search on one page
- [ ] `v0.5` — DiffDock/Boltz-2 "AI mode" when no structure exists

## 🙏 Credits

- [Webina](https://github.com/durrantlab/webina) — J. D. Durrant Lab (Apache-2.0) — the in-browser Vina
- [3Dmol.js](https://3dmol.org) — David Koes (BSD) — molecular graphics
- [AutoDock Vina](https://vina.scripps.edu/) — Scripps Research (Apache-2.0)
- RCSB PDB — structural data for 121D / 1BNA
- PDBe API — binding-site annotations snapshot (`docs/data/`)
- Inspired by the ecosystem survey in `research/2026-09-09-docking-automation-gui-tooling.md`

## 📄 License

MIT — see [LICENSE](LICENSE). Bundled third-party data keeps its own notices:
Webina/PDB structures follow their original terms (PDB content is public-domain-structured data;
see RCSB usage policies).
