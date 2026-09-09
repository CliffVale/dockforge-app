# Fixture provenance — every test file is a real file or a spec-derived synthetic

No fixture was invented from memory. Sources verified 2026-09-09.

| File | Format | Source | What it proves |
|---|---|---|---|
| `121d.pdb` | PDB | Local copy of the repo's bundled 121D asset (originally from RCSB) | PDB parse: DNA + HETATM ligand (NT, 31 atoms), waters, CONECT bonds |
| `1bna.cif` | mmCIF | https://files.rcsb.org/download/1BNA.cif | mmCIF `_atom_site` loop (566 atoms incl. waters), auth chain/seq ids, P elements |
| `ligand_NT.cif` | ligand CIF | https://files.rcsb.org/ligands/view/NT.cif | RCSB ligand dictionary: `chem_comp_atom` (57) + `chem_comp_bond` (58), charges, `pdbx_model_Cartn_*_ideal` coords |
| `netropsin_3d.sdf` | SDF V2000 | PubChem REST: compound/name/netropsin/SDF?record_type=3d | MDL V2000 counts + atom/bond blocks (57 atoms, 58 bonds) |
| `1iep_ligand.sdf` | SDF V2000 | ccsb-scripps/AutoDock-Vina repo, `example/basic_docking/data/` | RDKit-written record (STI, 69 atoms, 73 bonds) |
| `2P16_ligand_apixaban.pdbqt` | PDBQT | durrantlab/webina repo, `docking_files/benchmarks/` | Real Webina ligand: ROOT/BRANCH tree, charge cols 71–76, AD type cols 78–79 |
| `2P16_receptor_factorXa.pdbqt` | PDBQT | durrantlab/webina repo, `docking_files/benchmarks/` | Rigid receptor PDBQT (2768 atoms), AD type `A` (aromatic carbon) |
| `AF-P69905-F1-model_v6.pdb` | AlphaFold PDB | https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v6.pdb | pLDDT stored in B-factor column (per AFDB FAQ), 1077 atoms / 141 residues |
| `mol24.mol2` | MOL2 | openbabel/openbabel repo, `test/files/mol24.mol2` | TRIPOS atom/bond sections, dotted atom types (`C.ar`), charge column |
| `vina_config.txt` | Vina config | Reconstructed from the documented example at vina.scripps.edu/manual | `key = value` parsing, box center/size, numeric coercion, `#` comments |
| `receptor.gpf` | AutoDock GPF | Reconstructed from AutoDock 4.2 `autogrid` GPF keywords | npts/spacing/gridcenter/ligand_types/map keyword parsing |
| `hdock.out` | HDOCK result | Transcribed from the live example page at hdock.phys.hust.edu.cn/data/example/ | Docking Score / Ligand rmsd row parsing (ranks 1–5) |
| `analysis.cxc` | ChimeraX | Written per UCSF ChimeraX `alphafold` command docs (cgl.ucsf.edu) | `open` / `alphafold fetch` / `color` command extraction |
| `sample.gro` | GRO | Spec-derived (GROMACS fixed columns, coordinates in nm) | nm→Å conversion, fixed-column + whitespace-tolerant parsing, box line |
| `sample.crd` | CHARMM CRD | Generated with the exact format string from VMD `write_charmm_crd.tcl` | `%5d%5d %-4s %-4s%10.5f` CARD layout, round-trip |
| `sample_ext.crd` | CHARMM CRD EXT | Same source, EXT variant (`%10d`, `%20.10f`, ` EXT` flag) | Extended CARD layout, round-trip |

Synthetic files generated programmatically with Python using the verified format
strings (nothing hand-typed by eye). Real files downloaded from their upstream
sources and never edited.
