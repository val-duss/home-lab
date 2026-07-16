(function () {
  const gate = document.getElementById("gate");
  const portal = document.getElementById("portal");

  if (getToken()) {
    gate.hidden = true;
    portal.hidden = false;
    return;
  }

  document.getElementById("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("gate-code").value;
    const errorEl = document.getElementById("gate-error");
    errorEl.textContent = "";

    try {
      const res = await fetch(`${API_URL}/auth/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("bad code");
      const data = await res.json();
      setToken(data.access_token);
      gate.hidden = true;
      portal.hidden = false;
    } catch {
      errorEl.textContent = "Code incorrect";
    }
  });
})();
