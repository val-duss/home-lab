(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const tabsEl = document.getElementById("news-tabs");
  const listEl = document.getElementById("news-list");
  const errorEl = document.getElementById("news-error");

  const SAVED_KEY = "news_saved_links";
  const DISMISSED_KEY = "news_dismissed_links";
  const SAVED_VIEW = "__saved__";

  let newsByCategory = {};
  let categories = [];
  let activeCategory = null;

  function getSet(key) {
    try {
      return new Set(JSON.parse(localStorage.getItem(key)) || []);
    } catch {
      return new Set();
    }
  }

  function setInSet(key, link, value) {
    const set = getSet(key);
    if (value) {
      set.add(link);
    } else {
      set.delete(link);
    }
    localStorage.setItem(key, JSON.stringify([...set]));
  }

  function toggleInSet(key, link) {
    const next = !getSet(key).has(link);
    setInSet(key, link, next);
    return next;
  }

  function renderTabs() {
    const savedCount = getSet(SAVED_KEY).size;
    tabsEl.innerHTML =
      categories
        .map(
          (c) =>
            `<button class="chip tab-chip ${c.key === activeCategory ? "active" : ""}" data-key="${c.key}">${c.label}</button>`
        )
        .join("") +
      `<button class="chip tab-chip ${activeCategory === SAVED_VIEW ? "active" : ""}" data-key="${SAVED_VIEW}">🔖 À lire plus tard${savedCount ? ` (${savedCount})` : ""}</button>`;
  }

  function getArticlesForActiveView() {
    if (activeCategory === SAVED_VIEW) {
      const saved = getSet(SAVED_KEY);
      return Object.values(newsByCategory)
        .flat()
        .filter((a) => saved.has(a.link));
    }
    return newsByCategory[activeCategory] || [];
  }

  function renderArticles() {
    const articles = getArticlesForActiveView();
    if (articles.length === 0) {
      listEl.innerHTML = '<li class="muted">Aucun article.</li>';
      return;
    }

    const readLinks = getReadNewsLinks();
    const saved = getSet(SAVED_KEY);
    const dismissed = getSet(DISMISSED_KEY);

    listEl.innerHTML = articles
      .map((a) => {
        const date = a.published ? new Date(a.published).toLocaleString("fr-FR") : "";
        const isRead = readLinks.has(a.link);
        const isSaved = saved.has(a.link);
        const isDismissed = dismissed.has(a.link);
        const classes = [isRead ? "read" : "", isDismissed ? "dismissed" : ""].filter(Boolean).join(" ");

        return `
          <li class="news-item ${classes}" data-link="${a.link}">
            <div class="news-item-body">
              <a href="${a.link}" target="_blank" rel="noopener noreferrer" data-link="${a.link}">${a.title}</a>
              <div class="news-meta">${a.source}${date ? " · " + date : ""}</div>
            </div>
            <div class="news-actions">
              <button class="news-save ${isSaved ? "active" : ""}" data-link="${a.link}" title="À lire plus tard">🔖</button>
              <button class="news-dismiss ${isDismissed ? "active" : ""}" data-link="${a.link}" title="Pas intéressé">🚫</button>
            </div>
          </li>
        `;
      })
      .join("");
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn) return;
    activeCategory = btn.dataset.key;
    renderTabs();
    renderArticles();
  });

  listEl.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-link]");
    if (link) {
      markNewsLinkAsRead(link.dataset.link);
      link.closest(".news-item").classList.add("read");
      return;
    }

    const saveBtn = e.target.closest(".news-save");
    if (saveBtn) {
      toggleInSet(SAVED_KEY, saveBtn.dataset.link);
      renderTabs();
      renderArticles();
      return;
    }

    const dismissBtn = e.target.closest(".news-dismiss");
    if (dismissBtn) {
      toggleInSet(DISMISSED_KEY, dismissBtn.dataset.link);
      renderArticles();
    }
  });

  // Swipe tactile : droite = à lire plus tard, gauche = pas intéressé.
  // Complète les boutons, ne les remplace pas (utilisateurs non tactiles).
  let dragStartX = 0;
  let dragDeltaX = 0;
  let dragItem = null;

  listEl.addEventListener(
    "touchstart",
    (e) => {
      const item = e.target.closest(".news-item[data-link]");
      if (!item) return;
      dragItem = item;
      dragStartX = e.touches[0].clientX;
      dragItem.style.transition = "none";
    },
    { passive: true }
  );

  listEl.addEventListener(
    "touchmove",
    (e) => {
      if (!dragItem) return;
      dragDeltaX = e.touches[0].clientX - dragStartX;
      dragItem.style.transform = `translateX(${dragDeltaX}px)`;
      dragItem.classList.toggle("swipe-save-hint", dragDeltaX > 40);
      dragItem.classList.toggle("swipe-dismiss-hint", dragDeltaX < -40);
    },
    { passive: true }
  );

  listEl.addEventListener("touchend", () => {
    if (!dragItem) return;
    const item = dragItem;
    const link = item.dataset.link;
    item.style.transition = "transform 0.2s ease";
    item.classList.remove("swipe-save-hint", "swipe-dismiss-hint");

    if (dragDeltaX > 100) {
      item.style.transform = "translateX(120%)";
      setInSet(SAVED_KEY, link, true);
      setTimeout(() => {
        renderTabs();
        renderArticles();
      }, 200);
    } else if (dragDeltaX < -100) {
      item.style.transform = "translateX(-120%)";
      setInSet(DISMISSED_KEY, link, true);
      setTimeout(renderArticles, 200);
    } else {
      item.style.transform = "translateX(0)";
    }

    dragItem = null;
    dragDeltaX = 0;
  });

  (async function init() {
    try {
      const catRes = await apiFetch("/news/categories");
      categories = await catRes.json();
      activeCategory = categories[0]?.key || null;
      renderTabs();

      const newsRes = await apiFetch("/news");
      newsByCategory = await newsRes.json();
      renderArticles();
    } catch {
      errorEl.textContent = "Impossible de charger les actualités.";
    }
  })();
})();
