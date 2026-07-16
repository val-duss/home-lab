(function () {
  const gate = document.getElementById("gate");
  const portal = document.getElementById("portal");
  const pinStep = document.getElementById("pin-step");
  const changePinStep = document.getElementById("change-pin-step");
  const errorEl = document.getElementById("gate-error");

  async function renderNewsBadge() {
    const badge = document.getElementById("news-badge");
    if (!badge) return;
    try {
      const res = await apiFetch("/news");
      const newsByCategory = await res.json();
      const readLinks = getReadNewsLinks();
      const todayStr = new Date().toDateString();

      let count = 0;
      for (const articles of Object.values(newsByCategory)) {
        for (const article of articles) {
          if (!article.published_ts) continue;
          const articleDate = new Date(article.published_ts * 1000).toDateString();
          if (articleDate === todayStr && !readLinks.has(article.link)) {
            count++;
          }
        }
      }

      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    } catch {
      badge.hidden = true;
    }
  }

  if (getToken()) {
    gate.hidden = true;
    portal.hidden = false;
    renderNewsBadge();
    return;
  }

  function showPortal() {
    gate.hidden = true;
    portal.hidden = false;
    renderNewsBadge();
  }

  function showChangePinStep() {
    pinStep.hidden = true;
    changePinStep.hidden = false;
  }

  document.getElementById("pin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pin-input").value;
    errorEl.textContent = "";

    try {
      const res = await fetch(`${API_URL}/auth/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorEl.textContent = data.detail || "Code incorrect";
        if (res.status === 423) {
          document.getElementById("pin-input").disabled = true;
          e.target.querySelector("button").disabled = true;
        }
        return;
      }

      setToken(data.access_token);
      if (data.must_change) {
        showChangePinStep();
      } else {
        showPortal();
      }
    } catch {
      errorEl.textContent = "Erreur de connexion.";
    }
  });

  document.getElementById("change-pin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPin = document.getElementById("new-pin-input").value;
    const confirmPin = document.getElementById("new-pin-confirm").value;
    errorEl.textContent = "";

    if (!/^\d{6}$/.test(newPin)) {
      errorEl.textContent = "Le code doit contenir exactement 6 chiffres.";
      return;
    }
    if (newPin !== confirmPin) {
      errorEl.textContent = "Les deux codes ne correspondent pas.";
      return;
    }

    try {
      const res = await apiFetch("/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_pin: newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorEl.textContent = data.detail || "Impossible de changer le code.";
        return;
      }
      showPortal();
    } catch {
      errorEl.textContent = "Erreur de connexion.";
    }
  });
})();
