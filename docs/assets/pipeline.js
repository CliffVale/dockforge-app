/* DockForge pipeline.js — aptamer→structure→HADDOCK orchestration.
   Wraps DFHaddock (RNAfold, HADDOCK prep) and DFScience for the
   end-to-end workflow. No dependencies beyond haddock.js + science.js. */
(function (global) {
  "use strict";

  /* ======================== Sequence Validation ======================== */

  const DNA_RE = /^[ACGTRYSWKMBDHVN]+$/i;
  const RNA_RE = /^[ACGURYSWKMBDHVN]+$/i;

  function validateSequence(seq) {
    const clean = String(seq || "").replace(/[\s0-9]/g, "").toUpperCase();
    if (!clean) return { valid: false, error: "Empty sequence" };
    if (clean.length < 5) return { valid: false, error: "Sequence too short (min 5 nt)" };
    if (clean.length > 200) return { valid: false, error: "Sequence too long (max 200 nt for browser folding)" };
    if (DNA_RE.test(clean)) return { valid: true, type: "DNA", sequence: clean };
    if (RNA_RE.test(clean)) return { valid: true, type: "RNA", sequence: clean };
    return { valid: false, error: "Unrecognized characters — use ACGT(U) + IUPAC ambiguity codes" };
  }

  function formatSequence(seq, lineLen) {
    lineLen = lineLen || 60;
    const lines = [];
    for (let i = 0; i < seq.length; i += lineLen) {
      lines.push(seq.slice(i, i + lineLen));
    }
    return lines.join("\n");
  }

  /* ======================== FASTA Generation ======================== */

  function toFasta(name, sequence) {
    return ">" + (name || "aptamer") + "\n" + formatSequence(sequence, 70) + "\n";
  }

  function toVienna(name, sequence, structure) {
    return ">" + (name || "aptamer") + "\n" + sequence + "\n" + structure + "\n";
  }

  /* ======================== Pipeline Steps ======================== */

  // Step 1: Validate + analyze sequence
  function analyzeSequence(seq) {
    const v = validateSequence(seq);
    if (!v.valid) return { error: v.error };
    const gc = (v.sequence.match(/[GC]/g) || []).length;
    const gcPct = Math.round((gc / v.sequence.length) * 100);
    return {
      type: v.type,
      sequence: v.sequence,
      length: v.sequence.length,
      gcContent: gcPct,
      fasta: toFasta("aptamer", v.sequence),
      isHighGC: gcPct > 60
    };
  }

  // Step 2: Fold (calls DFHaddock.rnafoldWeb or local MFE)
  async function foldSequence(sequence, opts) {
    opts = opts || {};
    const temp = opts.temperature || 37;
    if (window.DFHaddock && window.DFHaddock.rnafoldWeb) {
      return await window.DFHaddock.rnafoldWeb(sequence, temp);
    }
    // Fallback: simple MFE stub (no API)
    return {
      structure: ".".repeat(sequence.length),
      mfe: 0,
      sequence: sequence,
      temperature: temp,
      fallback: true
    };
  }

  // Step 3: Check for pseudoknots (简单 heuristic: balanced parens with crossing)
  function detectPseudoknots(structure) {
    if (!structure) return { hasPseudoknot: false, nested: structure };
    // Remove pseudoknot notation (+, -, [, ]) if present
    const stripped = structure.replace(/[\[\]\+\-]/g, ".");
    const hasPK = structure !== stripped || /[\[\]\+\-]/.test(structure);
    // Count base pairs
    const bp = 0;
    const stack = [];
    let pairs = 0;
    for (const ch of structure) {
      if (ch === "(") stack.push("(");
      else if (ch === ")" && stack.length) { stack.pop(); pairs++; }
    }
    return {
      hasPseudoknot: hasPK,
      nested: stripped,
      basePairs: pairs,
      pairedFraction: structure.length ? Math.round((pairs * 2 / structure.length) * 100) : 0,
      suggestion: hasPK
        ? "Structure contains pseudoknot notation. For HADDOCK, use the nested (dot-bracket) version."
        : "Nested structure — ready for HADDOCK."
    };
  }

  // Step 4: Generate HADDOCK submission guidance
  function generateHaddockGuide(analysis, folding, pkInfo) {
    if (window.DFHaddock && window.DFHaddock.haddockPrepGuide) {
      return window.DFHaddock.haddockPrepGuide({
        sequence: analysis.sequence
      });
    }
    return "<p class='muted'>HADDOCK prep guide unavailable — load haddock.js first.</p>";
  }

  // Step 5: Build complete pipeline report
  function pipelineReport(analysis, folding, pkInfo) {
    const now = new Date();
    let html = "<h2>Pipeline Report</h2>";
    html += "<p class='small muted'>Generated " + now.toLocaleString() + "</p>";

    html += "<h3>1. Sequence Analysis</h3>";
    html += "<table><tr><th>Property</th><th>Value</th></tr>";
    html += "<tr><td>Type</td><td>" + analysis.type + "</td></tr>";
    html += "<tr><td>Length</td><td>" + analysis.length + " nt</td></tr>";
    html += "<tr><td>GC content</td><td>" + analysis.gcContent + "%" + (analysis.isHighGC ? " (high — stable)" : "") + "</td></tr>";
    html += "</table>";

    html += "<h3>2. Secondary Structure (RNAfold)</h3>";
    if (folding.fallback) {
      html += "<div class='warnbox'>⚠️ Using placeholder structure — EMBL-EBI API unavailable.</div>";
    }
    html += "<table><tr><th>Property</th><th>Value</th></tr>";
    html += "<tr><td>MFE</td><td>" + (folding.mfe || 0).toFixed(2) + " kcal/mol</td></tr>";
    html += "<tr><td>Structure</td><td class='mono' style='word-break:break-all'>" + (folding.structure || "—") + "</td></tr>";
    html += "</table>";

    html += "<h3>3. Pseudoknot Analysis</h3>";
    html += "<table><tr><th>Property</th><th>Value</th></tr>";
    html += "<tr><td>Pseudoknot detected</td><td>" + (pkInfo.hasPseudoknot ? "Yes" : "No") + "</td></tr>";
    html += "<tr><td>Base pairs</td><td>" + pkInfo.basePairs + " (" + pkInfo.pairedFraction + "% paired)</td></tr>";
    html += "<tr><td>Note</td><td>" + (pkInfo.suggestion || "—") + "</td></tr>";
    html += "</table>";

    html += "<h3>4. Next Steps</h3>";
    html += "<ol>";
    html += "<li>Download the FASTA/Vienna files above</li>";
    html += "<li>Prepare 3D structure (see HADDOCK prep guide below)</li>";
    html += "<li>Submit to <a href='http://wenmr.nl/haddock2.4/' target='_blank'>HADDOCK 2.4</a></li>";
    html += "</ol>";

    return html;
  }

  /* ======================== Export ======================== */

  global.DFPipeline = {
    validateSequence,
    formatSequence,
    toFasta,
    toVienna,
    analyzeSequence,
    foldSequence,
    detectPseudoknots,
    generateHaddockGuide,
    pipelineReport
  };
})(typeof window !== "undefined" ? window : globalThis);
