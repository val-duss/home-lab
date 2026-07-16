(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const tabsEl = document.getElementById("news-tabs");
  const listEl = document.getElementById("news-list");
  const errorEl = document.getElementById("news-error");

  let newsByCategory = {};
  let categories = [];
  let activeCategory = null;

  function renderTabs() {
    tabsEl.innerHTML = categories
      .map(
        (c) =>
          `<button class="chip tab-chip ${c.key === activeCategory ? "active" : ""}" data-key="${c.key}">${c.label}</button>`
      )
      .join("");
  }

  function renderArticles() {
    const articles = newsByCategory[activeCategory] || [];
    if (articles.length === 0) {
      listEl.innerHTML = '<li class="muted">Aucun article.</li>';
      return;
    }

    const readLinks = getReadNewsLinks();
    listEl.innerHTML = articles
      .map((a) => {
        const date = a.published ? new Date(a.published).toLocaleString("fr-FR") : "";
        const isRead = readLinks.has(a.link);
        return `
          <li class="news-item ${isRead ? "read" : ""}">
            <a href="${a.link}" target="_blank" rel="noopener noreferrer" data-link="${a.link}">${a.title}</a>
            <div class="news-meta">${a.source}${date ? " · " + date : ""}</div>
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
    if (!link) return;
    markNewsLinkAsRead(link.dataset.link);
    link.closest(".news-item").classList.add("read");
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
