async function checkHealth() {
  const statusEl = document.getElementById("status");
  try {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    statusEl.textContent = data.status === "ok" ? "OK ✅" : "KO ❌";
  } catch (e) {
    statusEl.textContent = "injoignable ❌";
  }
}

checkHealth();
