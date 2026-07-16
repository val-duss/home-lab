(function () {
  const gate = document.getElementById("gate");
  const portal = document.getElementById("portal");
  const pinStep = document.getElementById("pin-step");
  const changePinStep = document.getElementById("change-pin-step");
  const errorEl = document.getElementById("gate-error");

  if (getToken()) {
    gate.hidden = true;
    portal.hidden = false;
    return;
  }

  function showPortal() {
    gate.hidden = true;
    portal.hidden = false;
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
