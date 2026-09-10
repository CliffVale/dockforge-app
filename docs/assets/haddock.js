/* DockForge HADDOCK library — client-side HADDOCK 2.4 analysis tools.
   Ported from dock_analysis/scripts/haddock_analyzer.py and
   dna-protein-docking/scripts/haddock_prep.py.
   No dependencies beyond DFScience. */
(function (global) {
  "use strict";

  /* ======================== Score Parsing ======================== */

  // Parse the_score.list text into an array of model objects.
  // HADDOCK format: Rank  Model  Score  vdw  elec  desolv  air  bsa  ...
  function parseScoreList(text) {
    const models = [];
    const lines = String(text || "").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;
      // Collect numeric tokens
      const nums = parts.filter(p => !isNaN(parseFloat(p)) && isFinite(p)).map(Number);
      if (nums.length < 3) continue;
      const rank = parseInt(parts[0], 10);
      models.push({
        rank: isNaN(rank) ? models.length + 1 : rank,
        model: parts[1] || "struc_" + (models.length + 1),
        score: nums.length > 2 ? nums[2] : nums[0],
        vdw: nums.length > 3 ? nums[3] : 0,
        elec: nums.length > 4 ? nums[4] : 0,
        desolv: nums.length > 5 ? nums[5] : 0,
        air: nums.length > 6 ? nums[6] : 0,
        bsa: nums.length > 7 ? nums[7] : 0,
        cluster: 0
      });
    }
    return models;
  }

  // Detect if text is a HADDOCK score list
  function isHaddockScoreList(text) {
    if (!text) return false;
    const head = String(text).slice(0, 2000);
    return /HADDOCK\s+score/i.test(head) ||
           /\bvdw\b.*\belec\b.*\bdesolv\b/i.test(head) ||
           /Rank\s+Model\s+Score/i.test(head);
  }

  /* ======================== Clustering ======================== */

  // Group models by score proximity (simple threshold clustering).
  function clusterModels(models, threshold) {
    threshold = threshold || 5.0;
    const sorted = models.slice().sort((a, b) => a.score - b.score);
    const clusters = [];
    let current = [];
    for (const m of sorted) {
      if (!current.length) {
        current.push(m);
      } else if (Math.abs(m.score - current[0].score) < threshold) {
        current.push(m);
      } else {
        clusters.push(current);
        current = [m];
      }
    }
    if (current.length) clusters.push(current);
    // Assign cluster IDs and compute stats
    return clusters.map((group, i) => {
      const scores = group.map(m => m.score);
      group.forEach(m => m.cluster = i + 1);
      return {
        id: i + 1,
        size: group.length,
        bestScore: Math.min(...scores),
        meanScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        models: group
      };
    });
  }

  /* ======================== Contact Analysis ======================== */

  // Find contacts between protein and nucleic acid atoms from parsed PDB text.
  // cutoff in Angstroms; default 4.5 for contacts, 3.5 for H-bonds.
  function findContacts(parsedProtein, parsedNucleic, cutoff) {
    cutoff = cutoff || 4.5;
    const HBOND_CUTOFF = 3.5;
    const HBOND_DONORS_ACCEPTORS = new Set([
      "N", "O", "NZ", "ND1", "NE2", "OG", "OD1", "OD2",  // protein
      "O4", "O6", "N3", "N2", "N4"                         // nucleic acid
    ]);
    const contacts = [], hbonds = [];
    for (const p of parsedProtein) {
      for (const n of parsedNucleic) {
        const dx = p.x - n.x, dy = p.y - n.y, dz = p.z - n.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < cutoff) {
          const c = {
            proteinAtom: p.name, proteinResidue: p.res + p.resi, proteinChain: p.chain,
            dnaAtom: n.name, dnaResidue: n.res + n.resi, dnaChain: n.chain,
            distance: Math.round(dist * 100) / 100
          };
          contacts.push(c);
          if (dist < HBOND_CUTOFF &&
              (HBOND_DONORS_ACCEPTORS.has(p.name) || HBOND_DONORS_ACCEPTORS.has(n.name))) {
            hbonds.push(c);
          }
        }
      }
    }
    return { contacts, hbonds };
  }

  // Aggregate binding residue frequency across multiple models.
  function bindingResidueFrequency(allContacts) {
    const freq = {};
    for (const c of allContacts) {
      const key = c.proteinResidue;
      if (key) freq[key] = (freq[key] || 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([res, count]) => ({ residue: res, count }));
  }

  /* ======================== Score Interpretation ======================== */

  function interpretHaddockScore(score) {
    if (score < -100) return { label: "Excellent", color: "var(--accent)" };
    if (score < -80)  return { label: "Good",      color: "var(--accent2)" };
    if (score < -60)  return { label: "Moderate",   color: "#f59e0b" };
    return               { label: "Weak",         color: "#ef4444" };
  }

  /* ======================== HADDOCK Prep Guidance ======================== */

  // Generate HADDOCK submission guidance as HTML.
  function haddockPrepGuide(opts) {
    opts = opts || {};
    const seq = opts.sequence || "";
    return `
<h3>HADDOCK 2.4 Preparation</h3>
<div class="info-box" style="border-color:var(--accent2)">
<strong>Protocol:</strong> Based on Pan et al. (2026) Sensors &amp; Actuators A: Physical.
</div>

<h4>Step 1: Prepare Structures</h4>
<ol>
  <li><strong>Protein receptor:</strong> Clean PDB (remove water, add H at pH 7.4)</li>
  <li><strong>DNA/RNA ligand:</strong> Build 3D structure from sequence or use existing PDB</li>
  <li>Upload both to HADDOCK as Molecule A (receptor) and Molecule B (ligand)</li>
</ol>

<h4>Step 2: Define Restraints</h4>
<table>
  <tr><th>Mode</th><th>Restraints</th><th>When to use</th></tr>
  <tr><td><strong>Blind (recommended)</strong></td><td>Center-of-mass, force=1.0</td><td>Unknown binding site</td></tr>
  <tr><td><strong>Guided</strong></td><td>Active/passive residues</td><td>Known binding site</td></tr>
</table>

<h4>Step 3: Protocol Settings</h4>
<table>
  <tr><th>Parameter</th><th>Value</th></tr>
  <tr><td>Rigid-body energy minimization</td><td>1000 models</td></tr>
  <tr><td>Semi-flexible simulated annealing</td><td>Top 200</td></tr>
  <tr><td>Refinement in explicit solvent</td><td>Top 200</td></tr>
  <tr><td>180° rotated poses</td><td>Yes</td></tr>
  <tr><td>Internal NA restraints</td><td>Yes (preserve aptamer fold)</td></tr>
</table>

<h4>Step 4: Submit</h4>
<p><a href="http://wenmr.nl/haddock2.4/" target="_blank" class="btn accent">Open HADDOCK 2.4 Server ↗</a></p>

<h4>Score Interpretation</h4>
<table>
  <tr><th>Score</th><th>Binding</th></tr>
  <tr><td>&lt; -100</td><td style="color:var(--accent)">Excellent</td></tr>
  <tr><td>-80 to -100</td><td style="color:var(--accent2)">Good</td></tr>
  <tr><td>-60 to -80</td><td style="color:#f59e0b">Moderate</td></tr>
  <tr><td>&gt; -60</td><td style="color:#ef4444">Weak</td></tr>
</table>
${seq ? "<p><strong>Sequence:</strong> <code>" + seq + "</code></p>" : ""}
`;
  }

  /* ======================== RNAfold via EMBL-EBI ======================== */

  // Call the EMBL-EBI RNAfold web API. Returns {structure, mfe, sequence}.
  async function rnafoldWeb(sequence, temperature) {
    temperature = temperature || 37;
    const url = "https://www.ebi.ac.uk/Tools/services/rest/rnafold/run";
    const params = new URLSearchParams({
      email: "dockforge@example.com",
      sequence: sequence,
      temperature: String(temperature)
    });
    // Submit job
    const submitRes = await fetch(url, { method: "POST", body: params });
    if (!submitRes.ok) throw new Error("RNAfold submit failed: " + submitRes.status);
    const jobId = await submitRes.text();

    // Poll for result
    const statusUrl = "https://www.ebi.ac.uk/Tools/services/rest/rnafold/status/" + jobId;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(statusUrl);
      const status = await statusRes.text();
      if (status === "FINISHED") {
        const resultUrl = "https://www.ebi.ac.uk/Tools/services/rest/rnafold/result/" + jobId + "/json";
        const resultRes = await fetch(resultUrl);
        const data = await resultRes.json();
        return {
          structure: data.structure || "",
          mfe: parseFloat(data.energy) || 0,
          sequence: sequence,
          temperature: temperature
        };
      }
      if (status === "FAILED") throw new Error("RNAfold job failed");
    }
    throw new Error("RNAfold timeout");
  }

  /* ======================== Export ======================== */

  global.DFHaddock = {
    parseScoreList,
    isHaddockScoreList,
    clusterModels,
    findContacts,
    bindingResidueFrequency,
    interpretHaddockScore,
    haddockPrepGuide,
    rnafoldWeb
  };
})(typeof window !== "undefined" ? window : globalThis);
