(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const categoryChips = document.getElementById("category-chips");
  const categorySelect = document.getElementById("todo-category");
  const todoList = document.getElementById("todo-list");
  const errorEl = document.getElementById("todo-error");

  let categories = [];

  function renderCategories() {
    categoryChips.innerHTML =
      categories.map((c) => `<span class="chip chip-category">${c.name}</span>`).join("") ||
      '<span class="muted">Aucune catégorie</span>';

    categorySelect.innerHTML =
      '<option value="">Sans catégorie</option>' +
      categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }

  function renderTodos(todos) {
    if (todos.length === 0) {
      todoList.innerHTML = '<li class="muted">Aucune tâche.</li>';
      return;
    }

    todoList.innerHTML = todos
      .map((t) => {
        const categoryBadge = t.category
          ? `<span class="chip chip-category">${t.category.name}</span>`
          : "";
        const labelBadges = t.labels
          .map((l) => `<span class="chip chip-label">${l.name}</span>`)
          .join("");

        return `
          <li class="todo-item ${t.done ? "done" : ""}" data-id="${t.id}">
            <label>
              <input type="checkbox" class="todo-done" ${t.done ? "checked" : ""} />
              <span class="todo-text">${t.text}</span>
            </label>
            <span class="todo-tags">${categoryBadge}${labelBadges}</span>
            <button class="todo-delete" aria-label="Supprimer">✕</button>
          </li>
        `;
      })
      .join("");
  }

  const wishlistList = document.getElementById("wishlist-list");
  const wishlistTotal = document.getElementById("wishlist-total");

  function formatAmount(value) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
  }

  function renderWishlist(items) {
    if (items.length === 0) {
      wishlistList.innerHTML = '<li class="muted">Aucun article.</li>';
      wishlistTotal.textContent = "";
      return;
    }

    wishlistList.innerHTML = items
      .map(
        (item) => `
          <li class="todo-item" data-id="${item.id}">
            <span class="todo-text">${item.name}</span>
            <span class="todo-tags"><span class="chip chip-category">${formatAmount(item.amount)}</span></span>
            <button class="todo-delete wishlist-delete" aria-label="Supprimer">✕</button>
          </li>
        `
      )
      .join("");

    const total = items.reduce((sum, item) => sum + item.amount, 0);
    wishlistTotal.textContent = `Total : ${formatAmount(total)}`;
  }

  async function loadWishlist() {
    const res = await apiFetch("/wishlist");
    renderWishlist(await res.json());
  }

  document.getElementById("wishlist-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("wishlist-name");
    const amountInput = document.getElementById("wishlist-amount");
    const name = nameInput.value.trim();
    const amount = Number(amountInput.value);

    if (!name || Number.isNaN(amount) || amount < 0) return;

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount }),
      });
      if (!res.ok) throw new Error();
      nameInput.value = "";
      amountInput.value = "";
      await loadWishlist();
    } catch {
      errorEl.textContent = "Impossible d'ajouter cet article.";
    }
  });

  wishlistList.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("wishlist-delete")) return;
    const item = e.target.closest(".todo-item");
    if (!item) return;
    await apiFetch(`/wishlist/${item.dataset.id}`, { method: "DELETE" });
    await loadWishlist();
  });

  async function loadCategories() {
    const res = await apiFetch("/categories");
    categories = await res.json();
    renderCategories();
  }

  async function loadTodos() {
    const res = await apiFetch("/todos");
    renderTodos(await res.json());
  }

  document.getElementById("category-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("category-input");
    const name = input.value.trim();
    if (!name) return;
    errorEl.textContent = "";

    try {
      const res = await apiFetch("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      input.value = "";
      await loadCategories();
    } catch {
      errorEl.textContent = "Impossible d'ajouter cette catégorie.";
    }
  });

  document.getElementById("todo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const textInput = document.getElementById("todo-text");
    const labelsInput = document.getElementById("todo-labels");
    const text = textInput.value.trim();
    if (!text) return;

    const categoryId = categorySelect.value ? Number(categorySelect.value) : null;
    const labels = labelsInput.value
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category_id: categoryId, labels }),
      });
      if (!res.ok) throw new Error();
      textInput.value = "";
      labelsInput.value = "";
      await loadTodos();
    } catch {
      errorEl.textContent = "Impossible d'ajouter cette tâche.";
    }
  });

  todoList.addEventListener("click", async (e) => {
    const item = e.target.closest(".todo-item");
    if (!item) return;
    const id = item.dataset.id;

    if (e.target.classList.contains("todo-done")) {
      await apiFetch(`/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: e.target.checked }),
      });
      await loadTodos();
    }

    if (e.target.classList.contains("todo-delete")) {
      await apiFetch(`/todos/${id}`, { method: "DELETE" });
      await loadTodos();
    }
  });

  (async function init() {
    try {
      await loadCategories();
      await loadTodos();
      await loadWishlist();
    } catch {
      errorEl.textContent = "Impossible de charger la todo-list.";
    }
  })();
})();
