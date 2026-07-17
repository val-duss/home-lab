(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const tabsEl = document.getElementById("city-tabs");
  const currentEl = document.getElementById("weather-current");
  const dailyEl = document.getElementById("weather-daily");
  const setDefaultBtn = document.getElementById("set-default-btn");
  const deleteCityBtn = document.getElementById("delete-city-btn");
  const errorEl = document.getElementById("weather-error");

  let cities = [];
  let activeCityId = null;

  function renderTabs() {
    tabsEl.innerHTML = cities
      .map(
        (c) =>
          `<button class="chip tab-chip ${c.id === activeCityId ? "active" : ""}" data-id="${c.id}">${c.name}${c.is_default ? " ⭐" : ""}</button>`
      )
      .join("");
  }

  function renderForecast(forecast) {
    const current = forecast.current;
    currentEl.innerHTML = `
      <div class="weather-current-card">
        <span class="weather-emoji">${current.emoji}</span>
        <span class="weather-temp">${Math.round(current.temperature)}°C</span>
        <span class="weather-label">${current.label}</span>
        <span class="weather-wind">Vent : ${Math.round(current.wind_speed)} km/h</span>
      </div>
    `;

    dailyEl.innerHTML = forecast.daily
      .map((d) => {
        const date = new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
        return `
          <li class="weather-day">
            <span class="weather-day-date">${date}</span>
            <span class="weather-emoji">${d.emoji}</span>
            <span class="weather-day-temps">${Math.round(d.temperature_min)}° / ${Math.round(d.temperature_max)}°</span>
          </li>
        `;
      })
      .join("");
  }

  async function loadForecast(cityId) {
    try {
      const res = await apiFetch(`/weather/cities/${cityId}/forecast`);
      const forecast = await res.json();
      if (!res.ok) throw new Error(forecast.detail || "Erreur");
      renderForecast(forecast);
      errorEl.textContent = "";
    } catch (e) {
      currentEl.innerHTML = "";
      dailyEl.innerHTML = "";
      errorEl.textContent = e.message || "Impossible de charger la météo pour cette ville.";
    }
  }

  async function loadCities() {
    const res = await apiFetch("/weather/cities");
    cities = await res.json();

    if (cities.length === 0) {
      activeCityId = null;
      tabsEl.innerHTML = '<span class="muted">Aucune ville, ajoute-en une ci-dessous.</span>';
      currentEl.innerHTML = "";
      dailyEl.innerHTML = "";
      return;
    }

    if (!cities.some((c) => c.id === activeCityId)) {
      activeCityId = (cities.find((c) => c.is_default) || cities[0]).id;
    }

    renderTabs();
    await loadForecast(activeCityId);
  }

  tabsEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    activeCityId = Number(btn.dataset.id);
    renderTabs();
    await loadForecast(activeCityId);
  });

  setDefaultBtn.addEventListener("click", async () => {
    if (!activeCityId) return;
    await apiFetch(`/weather/cities/${activeCityId}/default`, { method: "POST" });
    await loadCities();
  });

  deleteCityBtn.addEventListener("click", async () => {
    if (!activeCityId) return;
    await apiFetch(`/weather/cities/${activeCityId}`, { method: "DELETE" });
    activeCityId = null;
    await loadCities();
  });

  document.getElementById("city-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("city-name");
    const name = input.value.trim();
    if (!name) return;

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/weather/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur");
      input.value = "";
      activeCityId = data.id;
      await loadCities();
    } catch (e2) {
      errorEl.textContent = e2.message || "Impossible d'ajouter cette ville.";
    }
  });

  (async function init() {
    try {
      await loadCities();
    } catch {
      errorEl.textContent = "Impossible de charger la météo.";
    }
  })();
})();
