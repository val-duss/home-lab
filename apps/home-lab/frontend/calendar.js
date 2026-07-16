(async function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const connectPanel = document.getElementById("connect-panel");
  const eventsList = document.getElementById("events-list");
  const errorEl = document.getElementById("calendar-error");

  document.getElementById("connect-btn").addEventListener("click", async () => {
    const res = await apiFetch("/calendar/auth-url");
    const { url } = await res.json();
    window.location.href = url;
  });

  try {
    const statusRes = await apiFetch("/calendar/status");
    const { connected } = await statusRes.json();

    if (!connected) {
      connectPanel.hidden = false;
      return;
    }

    const eventsRes = await apiFetch("/calendar/events");
    const { events } = await eventsRes.json();

    if (events.length === 0) {
      eventsList.innerHTML = "<li>Aucun événement à venir.</li>";
      return;
    }

    eventsList.innerHTML = events
      .map((ev) => {
        const start = ev.start?.dateTime || ev.start?.date || "";
        const title = ev.summary || "(Sans titre)";
        return `<li><strong>${new Date(start).toLocaleString("fr-FR")}</strong> — ${title}</li>`;
      })
      .join("");
  } catch (e) {
    errorEl.textContent = "Impossible de charger le calendrier.";
  }
})();
