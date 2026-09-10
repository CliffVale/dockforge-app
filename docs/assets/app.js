/* DockForge app shell: pro-layout nav + sidebar, theme toggle, command
   palette, toasts, progress, quizzes, badges. */
(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ---------- pages (pro-layout model: title, icon, group) ----------
  const PAGES = [
    { href: "index.html", label: "Home", icon: "🏠", group: "Start here" },
    { href: "course.html", label: "Course", icon: "🎓", group: "Start here" },
    { href: "glossary.html", label: "Glossary", icon: "📖", group: "Start here" },
    { href: "lab.html", label: "Docking Lab", icon: "🧪", group: "Work" },
    { href: "preview.html", label: "Live Preview", icon: "👁", group: "Work" },
    { href: "results.html", label: "Result Viewer", icon: "📊", group: "Work" },
    { href: "find.html", label: "Structure Finder", icon: "🔎", group: "Work" },
    { href: "tester.html", label: "Format Tester", icon: "🧪", group: "Work" },
    { href: "resources.html", label: "Resources", icon: "📚", group: "Reference" },
    { href: "workflow.html", label: "All-in-one workflow", icon: "🧭", group: "How-to" },
    { href: "pipeline.html", label: "Aptamer Pipeline", icon: "🧬", group: "Work" },
    { href: "compare.html", label: "Aptamer Compare", icon: "⚖️", group: "Work" },
    { href: "haddock.html", label: "HADDOCK Analyzer", icon: "🔬", group: "Work" }
  ];

  function hereName() { return location.pathname.split("/").pop() || "index.html"; }

  // ---------- theme (shadcn pattern: data-theme on <html>) ----------
  const THEME_KEY = "dockforge-theme";
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
    const b = $("#themeToggle");
    if (b) b.textContent = t === "light" ? "🌙 Dark" : "☀️ Light";
  }
  function initTheme() {
    let t = "dark";
    try { t = localStorage.getItem(THEME_KEY) || "dark"; } catch { /* ignore */ }
    applyTheme(t);
    document.addEventListener("click", e => {
      if (e.target && e.target.id === "themeToggle") {
        applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
      }
    });
  }

  // ---------- top nav ----------
  function buildNav() {
    const here = hereName();
    const nav = document.createElement("div");
    nav.className = "nav";
    nav.innerHTML =
      '<div class="wrap">' +
      '<a class="brand" href="index.html">Dock<span>Forge</span></a>' +
      PAGES.map(p => `<a class="link${p.href === here ? " active" : ""}" href="${p.href}">${p.label}</a>`).join("") +
      '<span style="flex:1"></span>' +
      '<button type="button" id="themeToggle" class="theme-toggle" aria-label="Toggle theme"></button>' +
      '<button type="button" id="cmdk" class="theme-toggle" title="Search (Ctrl+K)" aria-label="Open command palette">⌘K</button>' +
      '<a class="link" href="https://github.com/CliffVale/dockforge-app" target="_blank" rel="noopener">GitHub ↗</a>' +
      "</div>";
    const first = document.body.firstElementChild;
    document.body.insertBefore(nav, first);
  }

  // ---------- sidebar (ant-design-pro group model; index keeps full-width hero) ----------
  function buildSidebar() {
    const here = hereName();
    if (here === "index.html") return;
    const page = PAGES.find(p => p.href === here);
    const aside = document.createElement("aside");
    aside.className = "sidebar";
    const groups = {};
    PAGES.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
    let html = "";
    for (const g of Object.keys(groups)) {
      html += `<div class="group">${esc(g)}</div>`;
      html += groups[g].map(p =>
        `<a class="side-link${p.href === here ? " active" : ""}" href="${p.href}">${p.icon} ${p.label}</a>`).join("");
    }
    aside.innerHTML = html;
    const main = $("main.wrap");
    if (!main) return;
    // PageContainer pattern: title + description + breadcrumb in the content column
    const head = `
      <div class="page-head">
        <div class="breadcrumb"><a href="index.html">Home</a><span class="sep">/</span><span>${esc(page ? page.label : here)}</span></div>
        <h1>${page ? page.icon + " " + esc(page.label) : "DockForge"}</h1>
        <p class="desc">${esc((page && PAGE_DESC[here]) || "")}</p>
      </div>`;
    main.classList.add("content");
    const layout = document.createElement("div");
    layout.className = "layout";
    const content = document.createElement("div");
    content.className = "content";
    content.innerHTML = head;
    while (main.firstChild) content.appendChild(main.firstChild);
    layout.appendChild(aside);
    layout.appendChild(content);
    main.appendChild(layout);
  }
  const PAGE_DESC = {
    "course.html": "Seven short lessons that take you from \"what is a ligand\" to reading a real AutoDock Vina run — no installs.",
    "glossary.html": "Plain-English definitions of the docking vocabulary used across DockForge.",
    "lab.html": "Your guided docking bench: pick a kit, get the grid box, and run Webina in your browser.",
    "preview.html": "Drop any docking-related file — PDB, PDBQT, SDF, MOL2, mmCIF, AlphaFold models and more — for instant 3D preview.",
    "results.html": "Inspect Vina poses, validate redocking against a reference, and export a lab-ready notebook.",
    "find.html": "Search the RCSB PDB by name or PDB ID, and PubChem by name, CID or SMILES — then copy the chosen structure straight to the lab or the viewer.",
    "tester.html": "Drop any structure file and see it parsed, converted to other formats, and validated — with a pass/fail table so you can trust the result yourself.",
    "resources.html": "Curated links to the official docs and data sources behind DockForge: structure databases, file-format specs, visualization tools, and the docking tools we interoperate with.",
    "workflow.html": "One plain-English page for how to go from a protein and a molecule to a browser docking run — and exactly what DockForge does and does not do.",
    "pipeline.html": "End-to-end aptamer pipeline: enter a sequence, fold it with RNAfold, prepare structures, and guide HADDOCK docking — all in your browser.",
    "compare.html": "Compare multiple aptamer sequences side by side: fold quality, HADDOCK scores, binding residues, and interaction patterns.",
    "haddock.html": "Drop your HADDOCK output to analyze scores, clusters, contacts, and binding hotspots — with interactive 3D visualization."
  };

  // ---------- command palette (⌘K) ----------
  function buildPalette() {
    const backdrop = document.createElement("div");
    backdrop.className = "palette-backdrop";
    backdrop.id = "paletteBackdrop";
    backdrop.innerHTML = `
      <div class="palette" role="dialog" aria-label="Command palette">
        <input type="text" id="paletteInput" placeholder="Search pages and actions…  (↑ ↓ to choose, Enter to go)" autocomplete="off" />
        <ul class="palette-list" id="paletteList"></ul>
      </div>`;
    document.body.appendChild(backdrop);

    const items = () => {
      const list = PAGES.map(p => ({ label: p.icon + " " + p.label, hint: "page", go: p.href }));
      const fileInput = $("input[type=file]");
      if (fileInput) list.push({ label: "📎 Open a local file here", hint: "action", act: () => fileInput.click() });
      if (hereName() === "index.html") list.push({ label: "▶ Jump to the 60-second tour", hint: "action", act: () => { const t = $("#quickStart"); if (t) t.scrollIntoView({ behavior: "smooth" }); } });
      list.push({ label: "☀️/🌙 Toggle light/dark theme", hint: "action", act: () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light") });
      return list;
    };

    const input = $("#paletteInput"), listEl = $("#paletteList");
    let sel = 0, current = [];
    function render(q) {
      const query = (q || "").toLowerCase();
      current = items().filter(it => it.label.toLowerCase().includes(query));
      sel = 0;
      listEl.innerHTML = current.map((it, i) =>
        `<li data-i="${i}" class="${i === sel ? "sel" : ""}">${esc(it.label)}<span class="hint">${esc(it.hint)}</span></li>`).join("")
        || '<li class="muted">No matches — try "lab" or "preview"</li>';
    }
    function open() { backdrop.classList.add("open"); input.value = ""; render(""); setTimeout(() => input.focus(), 0); }
    function close() { backdrop.classList.remove("open"); }
    function run(it) {
      close();
      if (it.go) location.href = it.go;
      else if (it.act) it.act();
    }
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); backdrop.classList.contains("open") ? close() : open(); }
      else if (e.key === "Escape" && backdrop.classList.contains("open")) close();
      else if (backdrop.classList.contains("open") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        sel = Math.min(current.length - 1, Math.max(0, sel + (e.key === "ArrowDown" ? 1 : -1)));
        $$("#paletteList li").forEach((li, i) => li.classList.toggle("sel", i === sel));
      } else if (backdrop.classList.contains("open") && e.key === "Enter") {
        if (current[sel]) run(current[sel]);
      }
    });
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    listEl.addEventListener("click", e => {
      const li = e.target.closest("li");
      if (li && li.dataset.i != null && current[+li.dataset.i]) run(current[+li.dataset.i]);
    });
    input.addEventListener("input", () => render(input.value));
  }

  // ---------- toasts ----------
  function ensureToastHost() {
    if ($(".toast-host")) return;
    const host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  function toast(msg, kind) {
    ensureToastHost();
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    $(".toast-host").appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  // ---------- progress store ----------
  const KEY = "dockforge-progress-v1";
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
  }
  function markDone(id) {
    const s = loadStore();
    s[id] = true;
    saveStore(s);
    renderProgress();
  }
  function isDone(id) { return !!loadStore()[id]; }

  function renderProgress() {
    const bar = $("#progressbar");
    if (!bar) return;
    const total = Number(bar.dataset.total || 0);
    if (!total) return;
    const done = Object.keys(loadStore()).filter(k => k.startsWith("lesson-")).length;
    const pct = Math.round((Math.min(done, total) / total) * 100);
    bar.firstElementChild.style.width = pct + "%";
    const label = $("#progress-label");
    if (label) label.textContent = `${done} of ${total} lessons complete (${pct}%)`;
  }

  // ---------- quizzes ----------
  function wireQuizzes() {
    $$(".quiz").forEach(q => {
      const id = q.dataset.id;
      if (!id) return;
      if (isDone(id)) q.classList.add("done");
      $$("input[type=radio]", q).forEach(inp => {
        inp.addEventListener("change", () => {
          q.classList.add("done");
          markDone(id);
        });
      });
    });
  }

  // ---------- lesson completion buttons ----------
  function wireLessons() {
    $$(".lesson[data-lesson]").forEach(l => {
      const id = "lesson-" + l.dataset.lesson;
      const btn = document.createElement("button");
      btn.className = "btn ghost small";
      btn.type = "button";
      const refresh = () => { btn.textContent = isDone(id) ? "✓ Completed" : "Mark lesson complete"; };
      refresh();
      btn.addEventListener("click", () => {
        const s = loadStore();
        if (isDone(id)) { delete s[id]; saveStore(s); } else { markDone(id); }
        refresh();
      });
      l.appendChild(btn);
    });
  }

  // ---------- badges shelf ----------
  function renderBadges() {
    const host = $("#badgeShelf");
    if (!host || !window.DFScience) return;
    const list = DFScience.listBadges();
    host.innerHTML = list.map(b =>
      '<div class="badge-card' + (b.earned ? " earned" : "") + '" title="' + DF.esc(b.hint) + '">' +
      '<span class="badge-ico">' + b.icon + '</span>' +
      '<span class="badge-name">' + DF.esc(b.name) + '</span>' +
      '<span class="badge-hint">' + (b.earned ? new Date(b.at).toLocaleDateString() : DF.esc(b.hint)) + '</span>' +
      '</div>').join("");
  }
  function checkGraduate() {
    if (!window.DFScience) return;
    const done = Object.keys(loadStore()).filter(k => k.startsWith("lesson-")).length;
    if (done >= 7) DFScience.awardBadge("graduate");
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    buildNav();
    buildSidebar();
    buildPalette();
    wireQuizzes();
    wireLessons();
    renderProgress();
    checkGraduate();
    renderBadges();
  });

  // export for page scripts
  window.DF = { $, $$, esc, markDone, isDone, loadStore, saveStore, toast };
})();
