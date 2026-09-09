/* DockForge shared JS: nav injection, local storage progress, helpers */
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

  // ---------- nav ----------
  const PAGES = [
    ["index.html", "Home"],
    ["course.html", "Learn"],
    ["glossary.html", "Glossary"],
    ["lab.html", "Docking Lab"],
    ["preview.html", "Live Preview"],
    ["results.html", "Result Viewer"]
  ];

  function buildNav() {
    const here = location.pathname.split("/").pop() || "index.html";
    const nav = document.createElement("div");
    nav.className = "nav";
    nav.innerHTML =
      '<div class="wrap">' +
      '<a class="brand" href="index.html">Dock<span>Forge</span></a>' +
      PAGES.map(([href, label]) =>
        `<a class="link${href === here ? " active" : ""}" href="${href}">${label}</a>`
      ).join("") +
      '<span style="flex:1"></span>' +
      '<a class="link" href="https://github.com/CliffVale/dockforge-app" target="_blank" rel="noopener">GitHub ↗</a>' +
      "</div>";
    const first = document.body.firstElementChild;
    document.body.insertBefore(nav, first);
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

  // Progress bar shown on course page (and any page with #progressbar)
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

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    buildNav();
    wireQuizzes();
    wireLessons();
    renderProgress();
  });

  // export for page scripts
  window.DF = { $, $$, esc, markDone, isDone, loadStore, saveStore };
})();
