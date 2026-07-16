function getToken() {
  return localStorage.getItem("access_token");
}

function setToken(token) {
  localStorage.setItem("access_token", token);
}

function clearToken() {
  localStorage.removeItem("access_token");
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = "index.html";
    throw new Error("Session expirée");
  }
  return res;
}

const NEWS_READ_LINKS_KEY = "news_read_links";

function getReadNewsLinks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(NEWS_READ_LINKS_KEY)) || []);
  } catch {
    return new Set();
  }
}

function markNewsLinkAsRead(link) {
  const readLinks = getReadNewsLinks();
  readLinks.add(link);
  localStorage.setItem(NEWS_READ_LINKS_KEY, JSON.stringify([...readLinks]));
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback pour contexte non sécurisé (HTTP sur IP LAN) : l'API Clipboard moderne
  // exige HTTPS (ou localhost), execCommand reste disponible en HTTP.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
