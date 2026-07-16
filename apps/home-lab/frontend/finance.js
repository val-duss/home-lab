(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const accountsList = document.getElementById("accounts-list");
  const accountsTotal = document.getElementById("accounts-total");
  const stocksList = document.getElementById("stocks-list");
  const stocksTotal = document.getElementById("stocks-total");
  const institutionSelect = document.getElementById("institution-select");
  const errorEl = document.getElementById("finance-error");

  function formatAmount(value, currency) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR" }).format(
      value
    );
  }

  function renderAccounts(accounts) {
    if (accounts.length === 0) {
      accountsList.innerHTML = '<li class="muted">Aucun compte.</li>';
      accountsTotal.textContent = "";
      return;
    }

    accountsList.innerHTML = accounts
      .map((a) => {
        const kindLabel = a.kind === "livret" ? "Livret" : "Courant";
        const sourceBadge =
          a.source === "gocardless"
            ? '<span class="chip chip-label">synchronisé</span>'
            : "";
        return `
          <li class="todo-item" data-id="${a.id}">
            <span class="todo-text">${a.name}</span>
            <span class="todo-tags">
              <span class="chip chip-category">${kindLabel}</span>
              ${sourceBadge}
              <span class="chip">${formatAmount(a.balance, a.currency)}</span>
            </span>
            <button class="todo-delete account-delete" aria-label="Supprimer">✕</button>
          </li>
        `;
      })
      .join("");

    const total = accounts.reduce((sum, a) => sum + a.balance, 0);
    accountsTotal.textContent = `Total : ${formatAmount(total, "EUR")}`;
  }

  function renderStocks(stocks) {
    if (stocks.length === 0) {
      stocksList.innerHTML = '<li class="muted">Aucune position.</li>';
      stocksTotal.textContent = "";
      return;
    }

    stocksList.innerHTML = stocks
      .map((s) => {
        const gain = (s.current_price - s.purchase_price) * s.quantity;
        const gainClass = gain >= 0 ? "gain-positive" : "gain-negative";
        return `
          <li class="todo-item" data-id="${s.id}">
            <span class="todo-text">${s.name}${s.ticker ? ` (${s.ticker})` : ""} — ${s.quantity}</span>
            <span class="todo-tags">
              <span class="chip">${formatAmount(s.value, s.currency)}</span>
              <span class="chip ${gainClass}">${gain >= 0 ? "+" : ""}${formatAmount(gain, s.currency)}</span>
            </span>
            <button class="todo-delete stock-delete" aria-label="Supprimer">✕</button>
          </li>
        `;
      })
      .join("");

    const total = stocks.reduce((sum, s) => sum + s.value, 0);
    stocksTotal.textContent = `Total : ${formatAmount(total, "EUR")}`;
  }

  async function loadAccounts() {
    const res = await apiFetch("/finance/accounts");
    renderAccounts(await res.json());
  }

  async function loadStocks() {
    const res = await apiFetch("/finance/stocks");
    renderStocks(await res.json());
  }

  document.getElementById("account-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("account-name").value.trim();
    const kind = document.getElementById("account-kind").value;
    const balance = Number(document.getElementById("account-balance").value);
    if (!name || Number.isNaN(balance)) return;

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, balance }),
      });
      if (!res.ok) throw new Error();
      e.target.reset();
      await loadAccounts();
    } catch {
      errorEl.textContent = "Impossible d'ajouter ce compte.";
    }
  });

  accountsList.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("account-delete")) return;
    const item = e.target.closest(".todo-item");
    if (!item) return;
    await apiFetch(`/finance/accounts/${item.dataset.id}`, { method: "DELETE" });
    await loadAccounts();
  });

  document.getElementById("stock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("stock-name").value.trim();
    const ticker = document.getElementById("stock-ticker").value.trim() || null;
    const quantity = Number(document.getElementById("stock-quantity").value);
    const purchase_price = Number(document.getElementById("stock-purchase-price").value);
    const current_price = Number(document.getElementById("stock-current-price").value);
    if (!name || [quantity, purchase_price, current_price].some(Number.isNaN)) return;

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/finance/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ticker, quantity, purchase_price, current_price }),
      });
      if (!res.ok) throw new Error();
      e.target.reset();
      await loadStocks();
    } catch {
      errorEl.textContent = "Impossible d'ajouter cette position.";
    }
  });

  stocksList.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("stock-delete")) return;
    const item = e.target.closest(".todo-item");
    if (!item) return;
    await apiFetch(`/finance/stocks/${item.dataset.id}`, { method: "DELETE" });
    await loadStocks();
  });

  document.getElementById("link-bank-btn").addEventListener("click", async () => {
    const institutionId = institutionSelect.value;
    if (!institutionId) return;
    errorEl.textContent = "";
    try {
      const res = await apiFetch("/finance/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: institutionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur");
      window.location.href = data.link;
    } catch (e2) {
      errorEl.textContent = e2.message || "Impossible de lancer la liaison bancaire.";
    }
  });

  async function loadInstitutions() {
    try {
      const res = await apiFetch("/finance/institutions?country=FR");
      const institutions = await res.json();
      if (!res.ok) throw new Error();
      institutionSelect.innerHTML =
        '<option value="">Choisir une banque…</option>' +
        institutions.map((i) => `<option value="${i.id}">${i.name}</option>`).join("");
    } catch {
      institutionSelect.innerHTML = '<option value="">Indisponible</option>';
    }
  }

  (async function init() {
    try {
      await loadAccounts();
      await loadStocks();
      loadInstitutions();
    } catch {
      errorEl.textContent = "Impossible de charger les données financières.";
    }
  })();
})();
