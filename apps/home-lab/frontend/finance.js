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

  const editingBalance = new Set();
  const expandedHistory = new Set();
  const historyCache = {};

  function formatAmount(value, currency) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR" }).format(
      value
    );
  }

  function renderHistoryChart(points) {
    if (!points || points.length === 0) {
      return '<p class="muted">Pas encore d\'historique.</p>';
    }
    if (points.length === 1) {
      return `<p class="muted">Un seul point pour l'instant : ${formatAmount(points[0].balance, points[0].currency)}</p>`;
    }

    const width = 480;
    const height = 120;
    const padding = 24;
    const balances = points.map((p) => p.balance);
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const range = max - min || 1;
    const stepX = (width - padding * 2) / (points.length - 1);

    const coords = points.map((p, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((p.balance - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const first = points[0];
    const last = points[points.length - 1];

    return `
      <svg viewBox="0 0 ${width} ${height}" class="history-svg" preserveAspectRatio="xMidYMid meet">
        <polyline points="${coords.join(" ")}" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
      <div class="history-range">
        <span>${new Date(first.recorded_at).toLocaleDateString("fr-FR")} : ${formatAmount(first.balance, first.currency)}</span>
        <span>${new Date(last.recorded_at).toLocaleDateString("fr-FR")} : ${formatAmount(last.balance, last.currency)}</span>
      </div>
    `;
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
        const canEdit = a.source !== "gocardless";
        const isEditing = editingBalance.has(a.id);
        const isExpanded = expandedHistory.has(a.id);

        const balanceCell = isEditing
          ? `<input type="number" step="0.01" class="balance-edit-input" data-id="${a.id}" value="${a.balance}" />
             <button class="balance-save" data-id="${a.id}">✓</button>
             <button class="balance-cancel" data-id="${a.id}">✕</button>`
          : `<span class="chip">${formatAmount(a.balance, a.currency)}</span>
             ${canEdit ? `<button class="account-edit" data-id="${a.id}" aria-label="Modifier le solde">✏️</button>` : ""}`;

        const accountRow = `
          <li class="todo-item" data-id="${a.id}">
            <span class="todo-text">${a.name}</span>
            <span class="todo-tags">
              <span class="chip chip-category">${kindLabel}</span>
              ${sourceBadge}
              ${balanceCell}
            </span>
            <button class="history-toggle" data-id="${a.id}">${isExpanded ? "Masquer" : "Historique"}</button>
            <button class="todo-delete account-delete" aria-label="Supprimer">✕</button>
          </li>
        `;

        const historyRow = isExpanded
          ? `<li class="history-row">${renderHistoryChart(historyCache[a.id])}</li>`
          : "";

        return accountRow + historyRow;
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
    const target = e.target;

    if (target.classList.contains("account-delete")) {
      const item = target.closest(".todo-item");
      await apiFetch(`/finance/accounts/${item.dataset.id}`, { method: "DELETE" });
      await loadAccounts();
      return;
    }

    if (target.classList.contains("account-edit")) {
      editingBalance.add(Number(target.dataset.id));
      await loadAccounts();
      return;
    }

    if (target.classList.contains("balance-cancel")) {
      editingBalance.delete(Number(target.dataset.id));
      await loadAccounts();
      return;
    }

    if (target.classList.contains("balance-save")) {
      const id = Number(target.dataset.id);
      const input = document.querySelector(`.balance-edit-input[data-id="${id}"]`);
      const value = Number(input.value);
      if (Number.isNaN(value)) return;

      errorEl.textContent = "";
      try {
        const res = await apiFetch(`/finance/accounts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balance: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errorEl.textContent = data.detail || "Impossible de modifier le solde.";
          return;
        }
        editingBalance.delete(id);
        delete historyCache[id];
        if (expandedHistory.has(id)) {
          const histRes = await apiFetch(`/finance/accounts/${id}/history`);
          historyCache[id] = await histRes.json();
        }
        await loadAccounts();
      } catch {
        errorEl.textContent = "Impossible de modifier le solde.";
      }
      return;
    }

    if (target.classList.contains("history-toggle")) {
      const id = Number(target.dataset.id);
      if (expandedHistory.has(id)) {
        expandedHistory.delete(id);
      } else {
        expandedHistory.add(id);
        if (!historyCache[id]) {
          const res = await apiFetch(`/finance/accounts/${id}/history`);
          historyCache[id] = await res.json();
        }
      }
      await loadAccounts();
    }
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
