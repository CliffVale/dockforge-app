# DockForge vs. the landscape — what's different, what we adopted

> Date: 2026-09-09 · Method: live repo/site inspection + source-verified feature inventory (see workspace research notes for full citations)

## The comparison

| Project | What it is | Runs | Teaches? | Real engine in-browser? | DNA-focused? | Validate redocking? | Report export? |
|---|---|---|---|---|---|---|---|
| **DockForge (this repo)** | Course + lab + viewer + universal format layer + oligo tools | 100% static (GitHub Pages) | ✅ 7 lessons + glossary + walkthrough | ✅ Webina (Vina WASM) | ✅ 121D/1BNA kits, oligo designer | ✅ built-in RMSD validator | ✅ lab notebook (HTML/print) + 7-format export |
| [dockviz](https://github.com/ljmartin/dockviz) | Streamlit curation viewer for docking hits | needs Python server | ❌ | renders only (docking done elsewhere) | ❌ | ❌ | ❌ |
| [Webina](https://durrantlab.pitt.edu/webina/) | Vina compiled to WASM + minimal app | static | ❌ bare UI | ✅ (the engine we embed) | ❌ | ❌ | output files only |
| MTiOpenScreen / SwissDock / Neurosnap | docking web services | server-side queues | ❌ | ❌ (uploads) | ❌ | ❌ | server-specific |
| MzDOCK / AMDock | desktop GUI pipelines | local install | partial docs | ❌ | ❌ | partial (ADock redock mode) | CSV |
| MedChem Game & docking games | gamified drug-design apps | Android/app | ✅ gamified | ❌ simplified | ❌ | ❌ | ❌ |
| w3DNA / SCFBio B-DNA server | sequence → B-DNA structure builders | server | ❌ | ❌ | ✅ (structure building) | ❌ | PDB output |

## Gap we occupy (unique combination)

No existing project combines: **real docking engine in the browser + universal docking-format
read/write layer (16 formats, test-verified against real files) + beginner course + DNA/drug
examples + redocking validation + oligo analysis tools + classroom notebook export**, all as
static files with zero server and zero uploads. Individually, each piece exists somewhere; the
*integration* is the novelty. (v0.2 addition: `docs/assets/formats.js` + `docs/preview.html`
Live Preview — drop any of PDB/PDBQT/SDF/MOL2/mmCIF/ligand-CIF/XYZ/GRO/CRD/PSF/AF-model/
Vina-config/GPF/DPF/HDOCK/CXC and it's detected, parsed, rendered and re-exportable.)

## Adopted ideas (after testing)

| Idea | Source | What we took | Status |
|---|---|---|---|
| Pose curation workflow (score table + viewer) | dockviz | score table → click → 3D, CSV export | shipped in v0.1 |
| In-browser engine | Webina (Durrant Lab) | embed the app itself + guided kits around it | shipped in v0.1 |
| Redocking validation as a *feature* | AMDock/redocking practice (lesson 7) | client-side ligand RMSD vs crystal pose with PASS/CLOSE/FAIL verdict | **v0.2 (new)** |
| Sequence-first workflow | w3DNA/SCFBio (server builders) | client-side Oligo Designer: complement/RC, GC%, Tm (Wallace + long-oligo formula), MW, task card for the lab | **v0.2 (new)** |
| Gamification | docking-edu games | badge engine (localStorage): Course Complete, First Dock, Validator, Sharp Eye, Archivist, Base Pairs | **v0.2 (new)** |
| Classroom reporting | lab-notebook practice | one-click HTML notebook (pose snapshot, scores, verdict, badges) → print to PDF | **v0.2 (new)** |

## Deliberately NOT adopted (and why)

- **Server-side docking of user uploads** (MTiOpenScreen-style): conflicts with the zero-upload privacy stance; revisit in v0.3 self-host mode.
- **Full sequence→3D B-DNA generation** (w3DNA-style): requires a vetted nucleotide geometry tables we can't honestly fabricate client-side in v0.2; the Oligo Designer covers the analysis need and links out for structure building.
- **Accounts/leaderboards**: privacy-first, static-only.
