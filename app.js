"use strict";

const $ = (selector) => document.querySelector(selector);

const messageInput = $("#messageInput");
const composer = $("#composer");
const sendBtn = $("#sendBtn");
const messages = $("#messages");
const welcome = $("#welcome");
const fileInput = $("#fileInput");
const attachmentPreview = $("#attachmentPreview");
const historyEl = $("#history");
const searchInput = $("#searchInput");
const newChatBtn = $("#newChatBtn");
const topNewChat = $("#topNewChat");
const themeBtn = $("#themeBtn");
const clearBtn = $("#clearBtn");
const menuBtn = $("#menuBtn");
const sidebar = $("#sidebar");
const voiceBtn = $("#voiceBtn");
const toastEl = $("#toast");

let chats = loadChats();
let currentChatId = null;
let attachments = [];
let controller = null;
let generating = false;
let composing = false;
let mediaRecorder = null;
let audioChunks = [];

function loadChats() {
  try {
    return JSON.parse(localStorage.getItem("aura_chats") || "[]");
  } catch {
    return [];
  }
}

function saveChats() {
  localStorage.setItem("aura_chats", JSON.stringify(chats));
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

  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, lang, code) => `
      <pre><code>${code.trim()}</code></pre>
    `
  );

  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  html = html.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("<pre>")) return block;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  return html;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2200);
}

function updateSendState() {
  const hasText = messageInput.value.trim().length > 0;
  const hasFiles = attachments.length > 0;

  sendBtn.disabled = generating ? false : (!hasText && !hasFiles);

  const sendIcon = sendBtn.querySelector(".send-icon");
  const stopIcon = sendBtn.querySelector(".stop-icon");

  sendIcon.classList.toggle("hidden", generating);
  stopIcon.classList.toggle("hidden", !generating);

  sendBtn.setAttribute(
    "aria-label",
    generating ? "Stop generating" : "Send message"
  );

  sendBtn.title = generating ? "Stop generating" : "Send message";
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 170) + "px";
}

function renderHistory(filter = "") {
  historyEl.innerHTML = "";

  if (!chats.length) {
    historyEl.innerHTML = `
      <div class="history-title">Chats</div>
      <div style="padding:10px;color:var(--muted);font-size:12px;">
        No chats yet
      </div>
    `;
    return;
  }

  const filtered = chats.filter((chat) =>
    chat.title.toLowerCase().includes(filter.toLowerCase())
  );

  const title = document.createElement("div");
  title.className = "history-title";
  title.textContent = "Recent";
  historyEl.appendChild(title);

  filtered.forEach((chat) => {
    const button = document.createElement("button");
    button.className =
      "history-item" +
      (chat.id === currentChatId ? " active" : "");

    button.innerHTML = `
      <span>◌</span>
      <span>${escapeHTML(chat.title)}</span>
    `;

    button.addEventListener("click", () => {
      currentChatId = chat.id;
      renderChat();
      renderHistory(searchInput.value);
      sidebar.classList.remove("open");
    });

    historyEl.appendChild(button);
  });
}

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
    copy.textContent = "Copy";

    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(content);
      showToast("Copied");
    });

    const speak = document.createElement("button");
    speak.textContent = "Speak";

    speak.addEventListener("click", () => {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(content));
    });

    actions.append(copy, speak);
    contentWrap.appendChild(actions);
  }

  wrapper.append(avatar, contentWrap);
  messages.appendChild(wrapper);

  if (save) {
    const chat = ensureChat();

    chat.messages.push({
      role,
      content
    });

    if (
      role === "user" &&
      chat.title === "New chat"
    ) {
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
      <div class="typing">
        <i></i><i></i><i></i>
      </div>
    </div>
  `;

  messages.appendChild(wrapper);
  scrollBottom();
}

function removeTyping() {
  $("#typingMessage")?.remove();
}

async function readFile(file) {
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

    chip.innerHTML = `
      <span>${escapeHTML(file.name)}</span>
      <button type="button" aria-label="Remove attachment">×</button>
    `;

    chip.querySelector("button").addEventListener("click", () => {
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

  const totalSize =
    selected.reduce((sum, file) => sum + file.size, 0);

  if (totalSize > 12 * 1024 * 1024) {
    showToast("Total file size must be under 12 MB");
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(outgoing),
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI request failed");
    }

    removeTyping();

    renderMessage(
      "assistant",
      data.text || "I couldn't generate a response."
    );

    const current = getCurrentChat();

    if (current) {
      current.messages.push({
        role: "assistant",
        content: data.text || ""
      });

      saveChats();
    }

  } catch (error) {
    removeTyping();

    if (error.name === "AbortError") {
      showToast("Generation stopped");
    } else {
      renderMessage(
        "assistant",
        `Sorry, something went wrong.\n\n${error.message}`
      );
    }
  } finally {
    controller = null;
    generating = false;
    updateSendState();
    messageInput.focus();
  }
}

function stopGeneration() {
  if (controller) {
    controller.abort();
  }
}

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

  sidebar.classList.remove("open");
  messageInput.focus();
}

function applyTheme() {
  const current = localStorage.getItem("aura_theme") || "dark";

  if (current === "light") {
    document.documentElement.style.setProperty("--bg", "#f6f7fb");
    document.documentElement.style.setProperty("--panel", "#ffffff");
    document.documentElement.style.setProperty("--panel-2", "#f0f1f6");
    document.documentElement.style.setProperty("--border", "rgba(0,0,0,.08)");
    document.documentElement.style.setProperty("--text", "#111217");
    document.documentElement.style.setProperty("--muted", "#70727d");
    document.documentElement.style.setProperty("--user", "#ececf2");
  } else {
    document.documentElement.style.setProperty("--bg", "#0a0a0d");
    document.documentElement.style.setProperty("--panel", "#101116");
    document.documentElement.style.setProperty("--panel-2", "#15161c");
    document.documentElement.style.setProperty("--border", "rgba(255,255,255,.09)");
    document.documentElement.style.setProperty("--text", "#f5f5f7");
    document.documentElement.style.setProperty("--muted", "#9699a5");
    document.documentElement.style.setProperty("--user", "#1b1c23");
  }
}

function toggleTheme() {
  const current = localStorage.getItem("aura_theme") || "dark";

  localStorage.setItem(
    "aura_theme",
    current === "dark" ? "light" : "dark"
  );

  applyTheme();
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

messageInput.addEventListener("input", () => {
  autoResize();
  updateSendState();
});

messageInput.addEventListener("compositionstart", () => {
  composing = true;
});

messageInput.addEventListener("compositionend", () => {
  composing = false;
});

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
});

searchInput.addEventListener("input", () => {
  renderHistory(searchInput.value);
});

menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt;
    autoResize();
    updateSendState();
    messageInput.focus();
  });
});

voiceBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Voice recording is not supported");
    return;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    audioChunks = [];

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());

      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm"
      });

      showToast(`Voice recorded: ${Math.round(blob.size / 1024)} KB`);
      voiceBtn.classList.remove("recording");
    };

    mediaRecorder.start();
    voiceBtn.classList.add("recording");
    showToast("Recording... tap again to stop");

  } catch {
    showToast("Microphone permission denied");
  }
});

applyTheme();

if (chats.length) {
  currentChatId = chats[0].id;
}

renderHistory();
renderChat();
updateSendState();
