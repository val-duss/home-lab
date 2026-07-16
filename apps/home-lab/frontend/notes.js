(function () {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  const notesList = document.getElementById("notes-list");
  const errorEl = document.getElementById("notes-error");
  const editing = new Set();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderNotes(notes) {
    if (notes.length === 0) {
      notesList.innerHTML = '<li class="muted">Aucune note.</li>';
      return;
    }

    notesList.innerHTML = notes
      .map((note) => {
        if (editing.has(note.id)) {
          return `
            <li class="note-item" data-id="${note.id}">
              <input type="text" class="note-edit-title" value="${escapeHtml(note.title)}" />
              <textarea class="note-edit-content" rows="4">${escapeHtml(note.content)}</textarea>
              <div class="note-actions">
                <button class="note-save" data-id="${note.id}">Enregistrer</button>
                <button class="note-cancel" data-id="${note.id}">Annuler</button>
              </div>
            </li>
          `;
        }
        return `
          <li class="note-item" data-id="${note.id}">
            <div class="note-header">
              <strong>${escapeHtml(note.title)}</strong>
              <div class="note-actions">
                <button class="note-copy" data-id="${note.id}" title="Copier">📋</button>
                <button class="note-edit" data-id="${note.id}" title="Modifier">✏️</button>
                <button class="note-delete" data-id="${note.id}" title="Supprimer">✕</button>
              </div>
            </div>
            <pre class="note-content">${escapeHtml(note.content)}</pre>
          </li>
        `;
      })
      .join("");
  }

  async function refresh() {
    const res = await apiFetch("/notes");
    renderNotes(await res.json());
  }

  document.getElementById("note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("note-title");
    const contentInput = document.getElementById("note-content");
    const title = titleInput.value.trim();
    if (!title) return;

    errorEl.textContent = "";
    try {
      const res = await apiFetch("/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: contentInput.value }),
      });
      if (!res.ok) throw new Error();
      titleInput.value = "";
      contentInput.value = "";
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
      await refresh();
      return;
    }

    if (target.classList.contains("note-save")) {
      const item = target.closest(".note-item");
      const title = item.querySelector(".note-edit-title").value.trim();
      const content = item.querySelector(".note-edit-content").value;
      if (!title) return;

      errorEl.textContent = "";
      try {
        const res = await apiFetch(`/notes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        });
        if (!res.ok) throw new Error();
        editing.delete(id);
        await refresh();
      } catch {
        errorEl.textContent = "Impossible d'enregistrer cette note.";
      }
    }
  });

  (async function init() {
    try {
      await refresh();
    } catch {
      errorEl.textContent = "Impossible de charger les notes.";
    }
  })();
})();
