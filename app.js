"use strict";

/* ============================================================
   AURA AI — app.js
   Developer: Abhay Singh
   ============================================================ */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// ---------- DOM ----------
const messageInput = $("#messageInput");
const composer = $("#composer");
const sendBtn = $("#sendBtn");
const messages = $("#messages");
const welcome = $("#welcome");
const fileInput = $("#fileInput");
const attachmentPreview = $("#attachmentPreview");
const historyEl = $("#history");
const searchInput = $("#searchInput");
const searchClear = $("#searchClear");
const newChatBtn = $("#newChatBtn");
const topNewChat = $("#topNewChat");
const themeBtn = $("#themeBtn");
const themeIcon = $("#themeIcon");
const clearBtn = $("#clearBtn");
const menuBtn = $("#menuBtn");
const sidebar = $("#sidebar");
const sidebarClose = $("#sidebarClose");
const menuBackdrop = $("#menuBackdrop");
const voiceBtn = $("#voiceBtn");
const toastEl = $("#toast");

// ---------- STATE ----------
let chats = loadChats();
let currentChatId = null;
let attachments = [];
let controller = null;
let generating = false;
let composing = false;
let mediaRecorder = null;
let audioChunks = [];

// ---------- STORAGE ----------
function loadChats() {
  try {
    return JSON.parse(localStorage.getItem("aura_chats") || "[]");
  } catch {
    return [];
  }
}
function saveChats() {
  try {
    localStorage.setItem("aura_chats", JSON.stringify(chats));
  } catch {}
}

function createChat() {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    createdAt: Date.now()
  };
}

function getCurrentChat() {
  return chats.find((chat) => chat.id === currentChatId);
}

function ensureChat() {
  let chat = getCurrentChat();
  if (!chat) {
    chat = createChat();
    chats.unshift(chat);
    currentChatId = chat.id;
    saveChats();
  }
  return chat;
}

// ---------- UTILS ----------
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdown(text) {
  let html = escapeHTML(text);

  // Code fences
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, "$1<em>$2</em>");
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("<pre>")) return block;
      if (!block.trim()) return "";
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  return html;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
}

function timeGroup(ts) {
  const now = new Date();
  const d = new Date(ts);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  const startWeek = startToday - 7 * 86400000;
  if (d.getTime() >= startToday) return "Today";
  if (d.getTime() >= startYesterday) return "Yesterday";
  if (d.getTime() >= startWeek) return "Previous 7 days";
  return "Older";
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2200);
}

// ---------- COMPOSER ----------
function updateSendState() {
  const hasText = messageInput.value.trim().length > 0;
  const hasFiles = attachments.length > 0;

  sendBtn.disabled = generating ? false : (!hasText && !hasFiles);
  sendBtn.classList.toggle("generating", generating);

  const sendIcon = sendBtn.querySelector(".send-icon");
  const stopIcon = sendBtn.querySelector(".stop-icon");
  sendIcon.classList.toggle("hidden", generating);
  stopIcon.classList.toggle("hidden", !generating);

  sendBtn.setAttribute("aria-label", generating ? "Stop generating" : "Send message");
  sendBtn.title = generating ? "Stop generating" : "Send message";
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 170) + "px";
}

// ---------- HISTORY ----------
function renderHistory(filter = "") {
  historyEl.innerHTML = "";

  if (!chats.length) {
    historyEl.innerHTML = `<div class="history-empty">No chats yet</div>`;
    return;
  }

  const q = filter.toLowerCase().trim();
  const filtered = chats.filter((chat) => chat.title.toLowerCase().includes(q));

  if (!filtered.length) {
    historyEl.innerHTML = `<div class="history-empty">No matching chats</div>`;
    return;
  }

  // Group by time
  const groups = {};
  filtered.forEach((chat) => {
    const g = timeGroup(chat.createdAt);
    (groups[g] = groups[g] || []).push(chat);
  });

  const order = ["Today", "Yesterday", "Previous 7 days", "Older"];
  order.forEach((label) => {
    if (!groups[label]) return;
    const groupLabel = document.createElement("div");
    groupLabel.className = "history-group-label";
    groupLabel.textContent = label;
    historyEl.appendChild(groupLabel);

    groups[label].forEach((chat) => {
      const button = document.createElement("button");
      button.className = "history-item" + (chat.id === currentChatId ? " active" : "");
      button.type = "button";
      button.setAttribute("aria-label", `Open chat: ${chat.title}`);
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="hi-title">${escapeHTML(chat.title)}</span>
        <span class="hi-del" role="button" aria-label="Delete chat" tabindex="0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
      `;

      button.addEventListener("click", (e) => {
        if (e.target.closest(".hi-del")) {
          e.stopPropagation();
          deleteChat(chat.id);
          return;
        }
        currentChatId = chat.id;
        renderChat();
        renderHistory(searchInput.value);
        closeSidebar();
      });

      historyEl.appendChild(button);
    });
  });
}

function deleteChat(id) {
  if (!confirm("Delete this chat?")) return;
  chats = chats.filter((c) => c.id !== id);
  if (currentChatId === id) {
    currentChatId = chats[0]?.id || null;
  }
  saveChats();
  renderHistory(searchInput.value);
  renderChat();
  showToast("Chat deleted");
}

// ---------- CHAT RENDER ----------
function renderChat() {
  const chat = getCurrentChat();
  messages.innerHTML = "";

  if (!chat || chat.messages.length === 0) {
    welcome.classList.remove("hidden");
    return;
  }

  welcome.classList.add("hidden");

  chat.messages.forEach((message) => {
    renderMessage(message.role, message.content, false);
  });

  scrollBottom();
}

function renderMessage(role, content, save = true) {
  welcome.classList.add("hidden");

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "You" : "A";

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (role === "assistant") {
    bubble.innerHTML = markdown(content);
  } else {
    bubble.textContent = content;
  }

  contentWrap.appendChild(bubble);

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(content);
        showToast("Copied");
      } catch {
        showToast("Copy failed");
      }
    });

    const speak = document.createElement("button");
    speak.type = "button";
    speak.textContent = "Speak";
    speak.addEventListener("click", () => {
      if (!window.speechSynthesis) {
        showToast("Speech not supported");
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(content.replace(/```[\s\S]*?```/g, ""));
      const voices = window.speechSynthesis.getVoices();
      const isHindi = /[\u0900-\u097F]/.test(content);
      const v = isHindi
        ? voices.find((x) => /hi/i.test(x.lang))
        : voices.find((x) => /en-US/i.test(x.lang)) || voices[0];
      if (v) utter.voice = v;
      window.speechSynthesis.speak(utter);
    });

    const regen = document.createElement("button");
    regen.type = "button";
    regen.textContent = "Regenerate";
    regen.addEventListener("click", () => {
      const chat = getCurrentChat();
      if (!chat) return;
      // Drop the last assistant turn and resend the last user message
      const idx = chat.messages.map((m) => m.role).lastIndexOf("assistant");
      if (idx < 0) return;
      const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      chat.messages = chat.messages.slice(0, idx);
      saveChats();
      renderChat();
      messageInput.value = lastUser.content || "";
      autoResize();
      updateSendState();
      sendMessage();
    });

    actions.append(copy, speak, regen);
    contentWrap.appendChild(actions);
  }

  wrapper.append(avatar, contentWrap);
  messages.appendChild(wrapper);

  if (save) {
    const chat = ensureChat();
    chat.messages.push({ role, content });
    if (role === "user" && chat.title === "New chat") {
      chat.title = content.slice(0, 38);
    }
    saveChats();
    renderHistory(searchInput.value);
  }

  scrollBottom();
}

function scrollBottom() {
  requestAnimationFrame(() => {
    const area = $("#chatArea");
    area.scrollTop = area.scrollHeight;
  });
}

function addTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";
  wrapper.id = "typingMessage";
  wrapper.innerHTML = `
    <div class="message-avatar">A</div>
    <div class="message-content">
      <div class="typing"><i></i><i></i><i></i></div>
    </div>
  `;
  messages.appendChild(wrapper);
  scrollBottom();
}

function removeTyping() {
  $("#typingMessage")?.remove();
}

// ---------- ATTACHMENTS ----------
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        data: reader.result
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachments() {
  attachmentPreview.innerHTML = "";

  attachments.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";

    const isImage = /^image\//.test(file.type);
    const preview = isImage
      ? `<img src="${file.data}" alt="" />`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;

    chip.innerHTML = `
      ${preview}
      <div class="fc-info">
        <div class="fc-name">${escapeHTML(file.name)}</div>
        <div class="fc-size">${formatBytes(file.size)}</div>
      </div>
      <button class="fc-remove" type="button" aria-label="Remove attachment">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    chip.querySelector(".fc-remove").addEventListener("click", () => {
      attachments.splice(index, 1);
      renderAttachments();
      updateSendState();
    });

    attachmentPreview.appendChild(chip);
  });
}

async function handleFiles(files) {
  const selected = [...files];
  if (selected.length > 5) {
    showToast("Maximum 5 files allowed");
    return;
  }

  const totalSize = selected.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > 12 * 1024 * 1024) {
    showToast("Total size must be under 12 MB");
    return;
  }

  for (const file of selected) {
    if (file.size > 8 * 1024 * 1024) {
      showToast(`${file.name} is too large`);
      continue;
    }
    try {
      attachments.push(await readFile(file));
    } catch {
      showToast(`Could not read ${file.name}`);
    }
  }

  renderAttachments();
  updateSendState();
}

// ---------- SEND ----------
async function sendMessage() {
  if (generating) {
    stopGeneration();
    return;
  }

  const text = messageInput.value.trim();
  if (!text && attachments.length === 0) return;

  const chat = ensureChat();

  const outgoing = {
    message: text,
    attachments: attachments.map((file) => ({
      name: file.name,
      type: file.type,
      data: file.data
    })),
    history: chat.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }))
  };

  renderMessage("user", text || "[Attachment]");

  messageInput.value = "";
  autoResize();
  attachments = [];
  renderAttachments();

  generating = true;
  updateSendState();
  addTyping();

  controller = new AbortController();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(outgoing),
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI request failed");
    }

    removeTyping();

    const reply = data.text || data.message || "I couldn't generate a response.";
    renderMessage("assistant", reply);

    const current = getCurrentChat();
    if (current) {
      current.messages.push({ role: "assistant", content: reply });
      saveChats();
    }
  } catch (error) {
    removeTyping();

    if (error.name === "AbortError") {
      showToast("Generation stopped");
    } else {
      renderMessage("assistant", `Sorry, something went wrong.\n\n${error.message}`);
    }
  } finally {
    controller = null;
    generating = false;
    updateSendState();
    messageInput.focus();
  }
}

function stopGeneration() {
  if (controller) controller.abort();
}

// ---------- NEW CHAT ----------
function newChat() {
  const chat = createChat();
  chats.unshift(chat);
  currentChatId = chat.id;
  saveChats();

  messages.innerHTML = "";
  welcome.classList.remove("hidden");

  messageInput.value = "";
  attachments = [];

  renderAttachments();
  autoResize();
  updateSendState();
  renderHistory();

  closeSidebar();
  messageInput.focus();
}

// ---------- THEME ----------
function applyTheme() {
  const theme = localStorage.getItem("aura_theme") || "dark";
  document.documentElement.setAttribute("data-theme", theme);
  if (themeIcon) themeIcon.textContent = theme === "light" ? "☀" : "◐";

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#f7f8fc" : "#0a0a0d";
}

function toggleTheme() {
  const current = localStorage.getItem("aura_theme") || "dark";
  localStorage.setItem("aura_theme", current === "dark" ? "light" : "dark");
  applyTheme();
  showToast(`Theme: ${current === "dark" ? "Light" : "Dark"}`);
}

// ---------- SIDEBAR ----------
function openSidebar() {
  if (window.innerWidth <= 760) {
    sidebar.classList.add("open");
    menuBackdrop.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
}
function closeSidebar() {
  if (window.innerWidth <= 760) {
    sidebar.classList.remove("open");
    menuBackdrop.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
}

// ---------- EVENT BINDINGS ----------
composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

messageInput.addEventListener("input", () => {
  autoResize();
  updateSendState();
});
messageInput.addEventListener("compositionstart", () => { composing = true; });
messageInput.addEventListener("compositionend", () => { composing = false; });
messageInput.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    !composing
  ) {
    event.preventDefault();
    sendMessage();
  }
});

fileInput.addEventListener("change", () => {
  handleFiles(fileInput.files);
  fileInput.value = "";
});

newChatBtn.addEventListener("click", newChat);
topNewChat.addEventListener("click", newChat);
themeBtn.addEventListener("click", toggleTheme);

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all AURA AI chats?")) return;
  chats = [];
  currentChatId = null;
  localStorage.removeItem("aura_chats");
  newChat();
  renderHistory();
  showToast("All chats cleared");
});

searchInput.addEventListener("input", () => {
  const v = searchInput.value;
  searchClear.hidden = !v;
  renderHistory(v);
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.hidden = true;
  renderHistory();
  searchInput.focus();
});

menuBtn.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
menuBackdrop.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSidebar();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    newChat();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) closeSidebar();
});

// Suggestions
$$("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt;
    autoResize();
    updateSendState();
    messageInput.focus();
  });
});

// Voice recording
voiceBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Voice recording is not supported");
    return;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    voiceBtn.classList.remove("recording");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      showToast(`Voice recorded: ${Math.round(blob.size / 1024)} KB`);
      voiceBtn.classList.remove("recording");
    };

    mediaRecorder.start();
    voiceBtn.classList.add("recording");
    showToast("Recording… tap again to stop");
  } catch {
    showToast("Microphone permission denied");
  }
});

// ---------- INIT ----------
applyTheme();
if (chats.length) currentChatId = chats[0].id;
renderHistory();
renderChat();
updateSendState();
autoResize();
