// ==UserScript==
// @name         GRONKH.TV - Favorites Feature
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  Favoriten für Gronkh.TV! Favoriten können im User Dropdown verwaltet werden.
// @match        https://gronkh.tv/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  // ---------- Config ----------
  const KEY = "favorites.v1";         // storage key
  const SUBMENU_WIDTH = 360;           // px
  const SUBMENU_MAX_VH = 70;           // % of viewport height
  const MAX_VISIBLE_CHARS = 120;       // soft cap for visible text (tooltip shows full)
  const MAIN_MENU_EXTRA_WIDTH = 1.2;   // multiply existing width by this factor

  // ---------- Storage ----------
  const loadFavs = () => GM_getValue(KEY, {});
  const saveFavs = (obj) => GM_setValue(KEY, obj);

  // ---------- Title detection ----------
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  function getDisplayTitle() {
    const t1 = document.querySelector(".g-video-meta-title")?.textContent;
    if (clean(t1)) return clean(t1);
    const og = document.querySelector('meta[property="og:title"]')?.content;
    if (clean(og)) return clean(og);
    const h1 = document.querySelector("h1")?.textContent;
    if (clean(h1)) return clean(h1);
    return clean((document.title || "").replace(/\s+\|\s*gronkh\.tv/i, ""));
  }
  function getItemKey() {
    const m = location.pathname.match(/\/streams\/(\d+)/i);
    return m ? `stream:${m[1]}` : `url:${location.href}`;
  }

  // ---------- Utilities ----------
  function makeEl(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v);
    });
    if (text) el.textContent = text;
    return el;
  }
  function truncateForDisplay(str) {
    if (!str) return "";
    const s = clean(str);
    return s.length > MAX_VISIBLE_CHARS ? s.slice(0, MAX_VISIBLE_CHARS - 1) + "…" : s;
  }

  // ---------- IDs we inject ----------
  const IDS = {
    SEP: "tm-fav-separator",
    TOGGLE: "tm-fav-toggle",
    ROOT_ITEM: "tm-fav-root-item",
    SUBMENU: "tm-fav-submenu",
  };

  // Keep the main toggle button in sync with storage (e.g., when a favorite is removed from the submenu)
  function refreshToggleUI() {
    const btn = document.getElementById(IDS.TOGGLE);
    if (!btn) return;
    const now = loadFavs();
    const id = getItemKey();
    const nowFav = !!now[id];
    const iconName = nowFav ? "bookmark" : "bookmark_border";
    const label = nowFav ? "Als Favorit gespeichert" : "Als Favorit speichern";
    btn.innerHTML = `<i class="material-icons" aria-hidden="true">${iconName}</i>${label}`;
    btn.title = nowFav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen";
  }

  // ---------- Build UI ----------
  function buildToggle(dropdown) {
    const id = getItemKey();
    const favs = loadFavs();
    const isFav = !!favs[id];
    const title = getDisplayTitle();
    const url = location.href;

    const btn = makeEl("button", {
      id: IDS.TOGGLE,
      class: "g-navigation-item",
      style: "display:flex;align-items:center;gap:.5rem;white-space:nowrap;",
      title: isFav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen",
    }, isFav ? "Als Favorit gespeichert" : "Als Favorit speichern");

    const icon = makeEl("i", { class: "material-icons", "aria-hidden": "true" }, isFav ? "bookmark" : "bookmark_border");
    btn.prepend(icon);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const now = loadFavs();
      if (now[id]) delete now[id]; else now[id] = { title, url, addedAt: Date.now() };
      saveFavs(now);
      const nowFav = !!now[id];
      icon.textContent = nowFav ? "bookmark" : "bookmark_border";
      btn.lastChild.nodeValue = nowFav ? "Als Favorit gespeichert" : "Als Favorit speichern";
      btn.title = nowFav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen";
      const openPanel = document.getElementById(IDS.SUBMENU);
      if (openPanel) renderSubmenu(openPanel);
    });

    return btn;
  }

  function buildRootItem(dropdown) {
    const root = makeEl("div", {
      id: IDS.ROOT_ITEM,
      class: "g-navigation-item",
      style: "position:relative; display:flex; align-items:center; justify-content:space-between; gap:.75rem;",
    });
    const left = makeEl("div", { style: "display:flex;align-items:center;gap:.5rem;" });
    const star = makeEl("span", {}, "⭐");
    const label = makeEl("span", {}, "Favoriten");
    const caret = makeEl("span", { style: "margin-left:auto; opacity:.8;" }, "◂");

    left.appendChild(star);
    left.appendChild(label);
    root.appendChild(left);
    root.appendChild(caret);

    const panel = makeEl("div", {
      id: IDS.SUBMENU,
      style: `
        display:none;
        position:fixed;
        top:0; left:0;
        width:${SUBMENU_WIDTH}px;
        max-height:min(${SUBMENU_MAX_VH}vh, 100vh);
        overflow:auto;
        background:rgba(0,0,0,0.9);
        backdrop-filter:blur(2px);
        border-radius:8px;
        padding:6px;
        box-shadow:0 8px 24px rgba(0,0,0,0.28);
        z-index:2147483647;
      `,
    });
    document.body.appendChild(panel);
    renderSubmenu(panel);

    const GAP = 8;
    function positionPanel() {
      const rect = root.getBoundingClientRect();
      const left = Math.max(0, rect.left - GAP - panel.offsetWidth);
      let top = rect.top;
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      if (top > maxTop) top = maxTop;
      if (top < 0) top = 0;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
    function open() { renderSubmenu(panel); panel.style.display = "block"; positionPanel(); }
    function close() { panel.style.display = "none"; }

    let hoverTimer = null;
    root.addEventListener("mouseenter", open);
    root.addEventListener("mouseleave", () => {
      hoverTimer && clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { if (!panel.matches(":hover")) close(); }, 120);
    });
    panel.addEventListener("mouseleave", close);
    root.addEventListener("click", (e) => {
      e.stopPropagation();
      if (panel.style.display === "none") open(); else close();
    });

    document.addEventListener("click", (e) => { if (!root.contains(e.target) && !panel.contains(e.target)) close(); });
    window.addEventListener("scroll", () => { if (panel.style.display === "block") positionPanel(); }, true);
    window.addEventListener("resize", () => { if (panel.style.display === "block") positionPanel(); });

    const mo = new MutationObserver(() => { if (!root.isConnected) close(); });
    mo.observe(document.body, { childList: true, subtree: true });

    return root;
  }

  function renderSubmenu(panel) {
    panel.innerHTML = "";
    const header = makeEl("div", { class: "g-navigation-item", style: "cursor:default;font-weight:600;opacity:.95;margin-bottom:4px;" }, "⭐ Deine Favoriten");
    panel.appendChild(header);

    const favs = loadFavs();
    const entries = Object.entries(favs).sort((a, b) => (b[1].addedAt || 0) - (a[1].addedAt || 0));
    if (!entries.length) {
      const empty = makeEl("div", { class: "g-navigation-item", style: "cursor:default;opacity:.7;" }, "Keine Favoriten vorhanden");
      panel.appendChild(empty);
      return;
    }
    entries.forEach(([key, f]) => {
      const row = makeEl("div", { class: "g-navigation-item", style: "display:flex;align-items:center;gap:.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" });
      const link = makeEl("a", { href: f.url, title: f.title || f.url, style: `flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:${SUBMENU_WIDTH - 72}px;` }, truncateForDisplay(f.title || f.url));
      const remove = makeEl("button", { class: "g-navigation-item", title: "Entfernen", style: "display:flex;align-items:center;gap:.25rem;padding:.2rem .3rem;border:0;background:transparent;" });
      const x = makeEl("i", { class: "material-icons", "aria-hidden": "true" }, "close");
      remove.appendChild(x);
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = loadFavs();
        delete now[key];
        saveFavs(now);
        renderSubmenu(panel);
        // Also sync the parent toggle button state
        refreshToggleUI();
      });
      row.appendChild(link); row.appendChild(remove); panel.appendChild(row);
    });
  }

  function inject(dropdown) {
    if (dropdown.querySelector(`#${IDS.TOGGLE}`) || dropdown.querySelector(`#${IDS.ROOT_ITEM}`)) return;
    dropdown.appendChild(makeEl("hr", { id: IDS.SEP }));
    dropdown.appendChild(buildToggle(dropdown));
    dropdown.appendChild(buildRootItem(dropdown));
    const rect = dropdown.getBoundingClientRect();
    dropdown.style.width = `${rect.width * MAIN_MENU_EXTRA_WIDTH}px`;
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll(".g-nav-dropdown").forEach(inject);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => { document.querySelectorAll(".g-nav-dropdown").forEach(inject); }, 300);
})();
