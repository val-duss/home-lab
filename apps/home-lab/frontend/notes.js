(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const notesList = document.getElementById("notes-list");
  const errorEl = document.getElementById("notes-error");
  const labelFiltersEl = document.getElementById("label-filters");
  const editing = new Set();
  let activeLabelFilter = null;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function displayTitle(note) {
    if (note.title) return escapeHtml(note.title);
    const firstLine = (note.content || "").split("\n")[0].slice(0, 60);
    return firstLine ? escapeHtml(firstLine) + (note.content.length > 60 ? "…" : "") : "(sans titre)";
  }

  function renderNotes(notes) {
    if (notes.length === 0) {
      notesList.innerHTML = '<li class="muted">Aucune note.</li>';
      return;
    }

    notesList.innerHTML = notes
      .map((note) => {
        const labelNames = note.labels.map((l) => l.name).join(", ");

        if (editing.has(note.id)) {
          return `
            <li class="note-item" data-id="${note.id}">
              <input type="text" class="note-edit-title" placeholder="Sujet (optionnel)" value="${escapeHtml(note.title)}" />
              <textarea class="note-edit-content" rows="4">${escapeHtml(note.content)}</textarea>
              <input type="text" class="note-edit-labels" placeholder="Labels (séparés par des virgules)" value="${escapeHtml(labelNames)}" />
              <div class="note-actions">
                <button class="note-save" data-id="${note.id}">Enregistrer</button>
                <button class="note-cancel" data-id="${note.id}">Annuler</button>
              </div>
            </li>
          `;
        }

        const labelChips = note.labels
          .map((l) => `<span class="chip chip-label">${escapeHtml(l.name)}</span>`)
          .join("");

        return `
          <li class="note-item" data-id="${note.id}">
            <div class="note-header">
              <strong>${displayTitle(note)}</strong>
              <div class="note-actions">
                <button class="note-copy" data-id="${note.id}" title="Copier">📋</button>
                <button class="note-edit" data-id="${note.id}" title="Modifier">✏️</button>
                <button class="note-delete" data-id="${note.id}" title="Supprimer">✕</button>
              </div>
            </div>
            <pre class="note-content">${escapeHtml(note.content)}</pre>
            ${labelChips ? `<div class="todo-tags">${labelChips}</div>` : ""}
          </li>
        `;
      })
      .join("");
  }

  async function loadLabelFilters() {
    const res = await apiFetch("/notes/labels");
    const labels = await res.json();
    labelFiltersEl.innerHTML =
      `<button class="chip tab-chip ${!activeLabelFilter ? "active" : ""}" data-label="">Tous</button>` +
      labels
        .map(
          (l) =>
            `<button class="chip tab-chip ${activeLabelFilter === l.name ? "active" : ""}" data-label="${escapeHtml(l.name)}">${escapeHtml(l.name)}</button>`
        )
        .join("");
  }

  async function refresh() {
    const query = activeLabelFilter ? `?label=${encodeURIComponent(activeLabelFilter)}` : "";
    const res = await apiFetch(`/notes${query}`);
    renderNotes(await res.json());
  }

  labelFiltersEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-label]");
    if (!btn) return;
    activeLabelFilter = btn.dataset.label || null;
    await loadLabelFilters();
    await refresh();
  });

  document.getElementById("note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("note-title");
    const contentInput = document.getElementById("note-content");
    const labelsInput = document.getElementById("note-labels");
    const title = titleInput.value.trim();
    const content = contentInput.value;
    const labels = labelsInput.value
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    if (!title && !content.trim()) {
      errorEl.textContent = "La note ne peut pas être vide.";
      return;
    }

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || null, content, labels }),
      });
      if (!res.ok) throw new Error();
      titleInput.value = "";
      contentInput.value = "";
      labelsInput.value = "";
      await loadLabelFilters();
      await refresh();
    } catch {
      errorEl.textContent = "Impossible d'ajouter cette note.";
    }
  });

  notesList.addEventListener("click", async (e) => {
    const target = e.target;
    const id = Number(target.dataset.id);
    if (!id) return;

    if (target.classList.contains("note-copy")) {
      const content = target.closest(".note-item").querySelector(".note-content").textContent;
      try {
        await copyToClipboard(content);
        const original = target.textContent;
        target.textContent = "✅";
        setTimeout(() => {
          target.textContent = original;
        }, 1200);
      } catch {
        errorEl.textContent = "Impossible de copier dans le presse-papier.";
      }
      return;
    }

    if (target.classList.contains("note-edit")) {
      editing.add(id);
      await refresh();
      return;
    }

    if (target.classList.contains("note-cancel")) {
      editing.delete(id);
      await refresh();
      return;
    }

    if (target.classList.contains("note-delete")) {
      await apiFetch(`/notes/${id}`, { method: "DELETE" });
      await loadLabelFilters();
      await refresh();
      return;
    }

    if (target.classList.contains("note-save")) {
      const item = target.closest(".note-item");
      const title = item.querySelector(".note-edit-title").value.trim();
      const content = item.querySelector(".note-edit-content").value;
      const labels = item
        .querySelector(".note-edit-labels")
        .value.split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      if (!title && !content.trim()) {
        errorEl.textContent = "La note ne peut pas être vide.";
        return;
      }

      errorEl.textContent = "";
      try {
        const res = await apiFetch(`/notes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title || null, content, labels }),
        });
        if (!res.ok) throw new Error();
        editing.delete(id);
        await loadLabelFilters();
        await refresh();
      } catch {
        errorEl.textContent = "Impossible d'enregistrer cette note.";
      }
    }
  });

  // Dictée vocale (Web Speech API). Nécessite un contexte sécurisé (HTTPS ou
  // localhost) dans la plupart des navigateurs — indisponible en HTTP sur IP LAN.
  // Si tu utilises Tailscale, `tailscale serve` fournit une URL HTTPS qui débloque ça.
  const dictateBtn = document.getElementById("dictate-btn");
  const contentInput = document.getElementById("note-content");
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizing = false;

  if (!SpeechRecognitionCtor) {
    dictateBtn.disabled = true;
    dictateBtn.title = "Dictée vocale non supportée par ce navigateur";
  } else {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        contentInput.value = (contentInput.value ? contentInput.value + " " : "") + finalTranscript.trim();
      }
    };

    recognition.onerror = (event) => {
      errorEl.textContent =
        event.error === "not-allowed"
          ? "Micro refusé par le navigateur."
          : `Erreur de dictée : ${event.error} (contexte HTTPS requis en général).`;
      recognizing = false;
      dictateBtn.textContent = "🎤";
    };

    recognition.onend = () => {
      recognizing = false;
      dictateBtn.textContent = "🎤";
    };

    dictateBtn.addEventListener("click", () => {
      if (recognizing) {
        recognition.stop();
        return;
      }
      errorEl.textContent = "";
      try {
        recognition.start();
        recognizing = true;
        dictateBtn.textContent = "⏹";
      } catch {
        errorEl.textContent = "Impossible de démarrer la dictée.";
      }
    });
  }

  (async function init() {
    try {
      await loadLabelFilters();
      await refresh();
    } catch {
      errorEl.textContent = "Impossible de charger les notes.";
    }
  })();
})();
