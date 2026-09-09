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
| ⚗️ **Docking Lab** (`docs/lab.html`) | Example kits (NGAL/1X71 with crystal ligand + computed grid box; apo 1NGL), guided steps, and the embedded Webina app. |
| 📊 **Result Viewer** (`docs/results.html`) | Drag-and-drop Webina output: pose table parsed from `REMARK VINA RESULT`, interactive 3D (3Dmol.js), pocket residues (≤4 Å rule), heuristic H-bond lines, CSV export. |
| 🔤 **Glossary** (`docs/glossary.html`) | 40 jargon terms, searchable. |
| 📁 `docs/assets/` | Bundled structures: 1X71/1NGL PDBs, receptor-only and ligand-only PDBs, PDBe binding-site snapshot. |

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
- Example structures are from the [RCSB PDB](https://www.rcsb.org): 1X71 (NGAL + 2,3-dihydroxybenzamide) and 1NGL (apo-NGAL).
- **Health disclaimer:** docking scores are hypotheses, not medical guidance.

## 🗺 Roadmap

- [ ] `v0.1` — beginner site: course, glossary, lab (Webina), result viewer ← **you are here**
- [ ] `v0.2` — pipeline core: PDBFixer + Meeko receptor prep, RDKit/Gypsum-DL ligand prep, P2Rank auto-pocket, EasyDock-style orchestration, PLIP-style interaction reports
- [ ] `v0.3` — self-hostable server mode (Streamlit) for real virtual screening
- [ ] `v0.4` — aptamer ensemble mode (APTAMD-style conformer sets) for protein–aptamer docking
- [ ] `v0.5` — DiffDock/Boltz-2 "AI mode" when no structure exists

## 🙏 Credits

- [Webina](https://github.com/durrantlab/webina) — J. D. Durrant Lab (Apache-2.0) — the in-browser Vina
- [3Dmol.js](https://3dmol.org) — David Koes (BSD) — molecular graphics
- [AutoDock Vina](https://vina.scripps.edu/) — Scripps Research (Apache-2.0)
- RCSB PDB — structural data for 1X71 / 1NGL
- PDBe API — binding-site annotations snapshot (`docs/data/`)
- Inspired by the ecosystem survey in `research/2026-09-09-docking-automation-gui-tooling.md`

## 📄 License

MIT — see [LICENSE](LICENSE). Bundled third-party data keeps its own notices:
Webina/PDB structures follow their original terms (PDB content is public-domain-structured data;
see RCSB usage policies).
