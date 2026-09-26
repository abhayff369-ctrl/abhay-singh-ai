"use strict";

/* =========================================================
   AURA AI - FRONTEND
========================================================= */

const $ = (selector) => document.querySelector(selector);

const welcome = $("#welcome");
const messagesEl = $("#messages");
const typingRow = $("#typingRow");

const messageInput = $("#messageInput");
const sendBtn = $("#sendBtn");
const stopBtn = $("#stopBtn");

const attachBtn = $("#attachBtn");
const fileInput = $("#fileInput");

const micBtn = $("#micBtn");

const attachmentPreview = $("#attachmentPreview");

const sidebar = $("#sidebar");
const sidebarOverlay = $("#sidebarOverlay");

const chatHistory = $("#chatHistory");
const chatSearch = $("#chatSearch");

const newChatBtn = $("#newChatBtn");
const topNewChat = $("#topNewChat");

const menuBtn = $("#menuBtn");
const closeSidebar = $("#closeSidebar");

const themeBtn = $("#themeBtn");
const themeIcon = $("#themeIcon");

const clearChatsBtn = $("#clearChatsBtn");

const voiceModeBtn = $("#voiceModeBtn");

/* =========================================================
   STATE
========================================================= */

let messages = [];
let pendingAttachments = [];

let currentChatId = null;

let controller = null;

let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;

let voiceMode = false;

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TOTAL_SIZE = 12 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

const STORAGE_KEY = "aura_ai_chats_v1";
const THEME_KEY = "aura_ai_theme";

/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadChats();
  setupEvents();
  autoResize();
});

/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  messageInput.addEventListener("input", autoResize);

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  stopBtn.addEventListener("click", stopGeneration);

  attachBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (event) => {
    await handleFiles([...event.target.files]);
    fileInput.value = "";
  });

  micBtn.addEventListener("click", toggleRecording);

  newChatBtn.addEventListener("click", newChat);
  topNewChat.addEventListener("click", newChat);

  menuBtn.addEventListener("click", openSidebar);
  closeSidebar.addEventListener("click", closeSidebarMenu);
  sidebarOverlay.addEventListener("click", closeSidebarMenu);

  themeBtn.addEventListener("click", toggleTheme);

  clearChatsBtn.addEventListener("click", clearAllChats);

  chatSearch.addEventListener("input", renderChatHistory);

  voiceModeBtn.addEventListener("click", toggleVoiceMode);

  document.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      messageInput.value = button.dataset.prompt || "";
      autoResize();
      messageInput.focus();
    });
  });
}

/* =========================================================
   TEXTAREA
========================================================= */

function autoResize() {
  messageInput.style.height = "auto";

  const height = Math.min(
    messageInput.scrollHeight,
    160
  );

  messageInput.style.height = `${height}px`;
}

/* =========================================================
   FILE HANDLING
========================================================= */

async function handleFiles(files) {

  if (!files.length) return;

  if (pendingAttachments.length + files.length > MAX_ATTACHMENTS) {
    alert(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
    return;
  }

  let totalSize =
    pendingAttachments.reduce(
      (sum, item) => sum + item.size,
      0
    );

  for (const file of files) {

    if (file.size > MAX_FILE_SIZE) {
      alert(
        `${file.name} is too large.\nMaximum size is 8 MB per file.`
      );
      continue;
    }

    totalSize += file.size;

    if (totalSize > MAX_TOTAL_SIZE) {
      alert("Total attachment size cannot exceed 12 MB.");
      break;
    }

    const dataUrl = await readFileAsDataURL(file);

    pendingAttachments.push({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl
    });
  }

  renderAttachmentPreview();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview() {

  attachmentPreview.innerHTML = "";

  if (!pendingAttachments.length) {
    attachmentPreview.classList.add("hidden");
    return;
  }

  attachmentPreview.classList.remove("hidden");

  pendingAttachments.forEach((file) => {

    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    if (file.mimeType.startsWith("image/")) {

      const img = document.createElement("img");
      img.src = file.dataUrl;
      img.alt = file.name;

      chip.appendChild(img);

    } else {

      const div = document.createElement("div");
      div.className = "file-mini";

      div.innerHTML = `
        <div style="font-size:22px">📄</div>
        <div>${escapeHTML(shortFileName(file.name))}</div>
      `;

      chip.appendChild(div);
    }

    const remove = document.createElement("button");

    remove.className = "remove-attachment";
    remove.textContent = "×";

    remove.addEventListener("click", () => {

      pendingAttachments =
        pendingAttachments.filter(
          item => item.id !== file.id
        );

      renderAttachmentPreview();
    });

    chip.appendChild(remove);

    attachmentPreview.appendChild(chip);
  });
}

/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage(customText = null) {

  if (controller) return;

  const text =
    customText !== null
      ? customText.trim()
      : messageInput.value.trim();

  if (!text && !pendingAttachments.length) {
    messageInput.focus();
    return;
  }

  const attachments = pendingAttachments.map(item => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    dataUrl: item.dataUrl
  }));

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    text: text || "Please analyze the attached file.",
    attachments: attachments.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      dataUrl: file.dataUrl
    })),
    createdAt: Date.now()
  };

  messages.push(userMessage);

  renderMessages();
  saveCurrentChat();

  messageInput.value = "";
  autoResize();

  pendingAttachments = [];
  renderAttachmentPreview();

  welcome.classList.add("hidden");

  showTyping();

  controller = new AbortController();

  sendBtn.classList.add("hidden");
  stopBtn.classList.remove("hidden");

  try {

    const history = messages
      .slice(0, -1)
      .slice(-20)
      .map(message => ({
        role: message.role,
        text: message.text
      }));

    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: userMessage.text,
        history,
        attachments: attachments.map(file => ({
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          data: file.dataUrl
        }))
      }),

      signal: controller.signal
    });

    const data = await response.json().catch(() => ({
      success: false,
      error: "Invalid server response."
    }));

    if (!response.ok || !data.success) {

      throw new Error(
        data.error ||
        `Request failed with status ${response.status}`
      );
    }

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: data.text || "I couldn't generate a response.",
      model: data.usedModel || null,
      createdAt: Date.now()
    };

    messages.push(assistantMessage);

    renderMessages();
    saveCurrentChat();

    if (voiceMode) {
      speakText(assistantMessage.text);
    }

  } catch (error) {

    if (error.name === "AbortError") {
      hideTyping();
      return;
    }

    console.error(error);

    const errorMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text:
        `⚠️ ${error.message || "Something went wrong."}`,
      isError: true,
      createdAt: Date.now()
    };

    messages.push(errorMessage);

    renderMessages();
    saveCurrentChat();

  } finally {

    controller = null;

    hideTyping();

    sendBtn.classList.remove("hidden");
    stopBtn.classList.add("hidden");
  }
}

/* =========================================================
   STOP
========================================================= */

function stopGeneration() {

  if (controller) {
    controller.abort();
    controller = null;
  }

  hideTyping();

  sendBtn.classList.remove("hidden");
  stopBtn.classList.add("hidden");
}

/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages() {

  messagesEl.innerHTML = "";

  messages.forEach((message) => {

    const row = document.createElement("div");

    row.className =
      `message-row ${message.role}`;

    const avatar = document.createElement("div");

    avatar.className =
      `avatar ${
        message.role === "assistant"
          ? "assistant-avatar"
          : ""
      }`;

    avatar.textContent =
      message.role === "assistant"
        ? "✦"
        : "You";

    const content = document.createElement("div");
    content.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (message.role === "assistant") {

      bubble.innerHTML =
        renderMarkdown(message.text);

    } else {

      bubble.textContent = message.text;
    }

    content.appendChild(bubble);

    if (
      message.attachments &&
      message.attachments.length
    ) {
      message.attachments.forEach(file => {
        content.appendChild(
          renderAttachmentCard(file)
        );
      });
    }

    if (message.role === "assistant") {

      const actions =
        document.createElement("div");

      actions.className = "message-actions";

      const copyBtn =
        createActionButton("Copy", () => {
          copyText(message.text);
        });

      const speakBtn =
        createActionButton("🔊", () => {
          speakText(message.text);
        });

      const regenBtn =
        createActionButton("↻", () => {
          regenerate(message.id);
        });

      actions.append(
        copyBtn,
        speakBtn,
        regenBtn
      );

      content.appendChild(actions);
    }

    if (message.role === "user") {
      row.append(content, avatar);
    } else {
      row.append(avatar, content);
    }

    messagesEl.appendChild(row);
  });

  requestAnimationFrame(() => {
    const content = $(".content");

    content.scrollTo({
      top: content.scrollHeight,
      behavior: "smooth"
    });
  });
}

/* =========================================================
   ATTACHMENT CARD
========================================================= */

function renderAttachmentCard(file) {

  const card =
    document.createElement("div");

  card.className = "attachment-card";

  if (
    file.mimeType &&
    file.mimeType.startsWith("image/") &&
    file.dataUrl
  ) {

    const img = document.createElement("img");

    img.src = file.dataUrl;
    img.alt = file.name;

    card.appendChild(img);

  } else {

    const icon =
      document.createElement("div");

    icon.className = "file-icon";
    icon.textContent = getFileEmoji(file.mimeType);

    const info =
      document.createElement("div");

    info.className = "file-info";

    info.innerHTML = `
      <div class="file-name">
        ${escapeHTML(file.name)}
      </div>
      <div class="file-size">
        ${formatBytes(file.size)}
      </div>
    `;

    card.append(icon, info);
  }

  return card;
}

/* =========================================================
   MARKDOWN
========================================================= */

function renderMarkdown(text) {

  if (!text) return "";

  const codeBlocks = [];

  let html = escapeHTML(text);

  html = html.replace(
    /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g,
    (_, language, code) => {

      const index = codeBlocks.length;

      codeBlocks.push(`
        <pre><code>${code.trim()}</code></pre>
      `);

      return `___CODE_BLOCK_${index}___`;
    }
  );

  html = html.replace(
    /`([^`]+)`/g,
    '<code class="inline-code">$1</code>'
  );

  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  html = html.replace(
    /\*(.*?)\*/g,
    "<em>$1</em>"
  );

  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  html = html.replace(/\n/g, "<br>");

  codeBlocks.forEach((block, index) => {
    html = html.replace(
      `___CODE_BLOCK_${index}___`,
      block
    );
  });

  return html;
}

/* =========================================================
   ACTIONS
========================================================= */

function createActionButton(text, callback) {

  const button =
    document.createElement("button");

  button.textContent = text;

  button.addEventListener(
    "click",
    callback
  );

  return button;
}

async function copyText(text) {

  try {

    await navigator.clipboard.writeText(text);

  } catch {

    const textarea =
      document.createElement("textarea");

    textarea.value = text;

    document.body.appendChild(textarea);

    textarea.select();

    document.execCommand("copy");

    textarea.remove();
  }
}

function regenerate(messageId) {

  const index =
    messages.findIndex(
      item => item.id === messageId
    );

  if (index === -1) return;

  let userIndex = index - 1;

  while (
    userIndex >= 0 &&
    messages[userIndex].role !== "user"
  ) {
    userIndex--;
  }

  if (userIndex < 0) return;

  const oldAssistant =
    messages[index];

  messages.splice(index, 1);

  renderMessages();

  const userMessage =
    messages[userIndex];

  /*
    Regeneration with attachments from the
    current session is supported.
  */

  pendingAttachments =
    (userMessage.attachments || []).map(file => ({
      ...file
    }));

  sendMessage(userMessage.text);
}

/* =========================================================
   TYPING
========================================================= */

function showTyping() {
  typingRow.classList.remove("hidden");
}

function hideTyping() {
  typingRow.classList.add("hidden");
}

/* =========================================================
   VOICE RECORDING
========================================================= */

async function toggleRecording() {

  if (mediaRecorder &&
      mediaRecorder.state === "recording") {

    stopRecording();
    return;
  }

  if (!navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia) {

    alert(
      "Voice recording is not supported by this browser."
    );

    return;
  }

  try {

    mediaStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg"
    ];

    let selectedMime = "";

    for (const type of mimeTypes) {

      if (
        window.MediaRecorder &&
        MediaRecorder.isTypeSupported(type)
      ) {
        selectedMime = type;
        break;
      }
    }

    mediaRecorder = selectedMime
      ? new MediaRecorder(
          mediaStream,
          { mimeType: selectedMime }
        )
      : new MediaRecorder(mediaStream);

    audioChunks = [];

    mediaRecorder.ondataavailable =
      event => {

        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

    mediaRecorder.onstop =
      async () => {

        const blob =
          new Blob(
            audioChunks,
            {
              type:
                mediaRecorder.mimeType ||
                "audio/webm"
            }
          );

        await addVoiceAttachment(blob);

        if (mediaStream) {
          mediaStream
            .getTracks()
            .forEach(track => track.stop());
        }
      };

    mediaRecorder.start();

    micBtn.classList.add("recording");
    micBtn.textContent = "■";
    micBtn.title = "Stop recording";

  } catch (error) {

    console.error(error);

    alert(
      "Microphone permission was denied or unavailable."
    );
  }
}

function stopRecording() {

  if (
    mediaRecorder &&
    mediaRecorder.state !== "inactive"
  ) {
    mediaRecorder.stop();
  }

  micBtn.classList.remove("recording");
  micBtn.textContent = "🎙";
  micBtn.title = "Voice message";
}

async function addVoiceAttachment(blob) {

  if (blob.size > MAX_FILE_SIZE) {

    alert("Voice message is larger than 8 MB.");
    return;
  }

  const dataUrl =
    await blobToDataURL(blob);

  let extension = "webm";

  if (blob.type.includes("mp4")) {
    extension = "m4a";
  } else if (blob.type.includes("ogg")) {
    extension = "ogg";
  }

  pendingAttachments.push({
    id: crypto.randomUUID(),
    name: `voice-message-${Date.now()}.${extension}`,
    mimeType: blob.type || "audio/webm",
    size: blob.size,
    dataUrl
  });

  renderAttachmentPreview();
}

function blobToDataURL(blob) {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onloadend = () =>
      resolve(reader.result);

    reader.onerror = reject;

    reader.readAsDataURL(blob);
  });
}

/* =========================================================
   SPEECH
========================================================= */

function speakText(text) {

  if (!("speechSynthesis" in window)) {

    alert(
      "Text-to-speech is not supported by this browser."
    );

    return;
  }

  window.speechSynthesis.cancel();

  const cleanText =
    text
      .replace(/```[\s\S]*?```/g, " code ")
      .replace(/[*_#]/g, "")
      .trim();

  const utterance =
    new SpeechSynthesisUtterance(cleanText);

  const containsHindi =
    /[\u0900-\u097F]/.test(cleanText);

  utterance.lang =
    containsHindi
      ? "hi-IN"
      : "en-US";

  utterance.rate = .95;
  utterance.pitch = 1;

  window.speechSynthesis.speak(
    utterance
  );
}

function toggleVoiceMode() {

  voiceMode = !voiceMode;

  voiceModeBtn.classList.toggle(
    "active",
    voiceMode
  );

  voiceModeBtn.textContent =
    voiceMode
      ? "🔊 Voice mode: On"
      : "🔊 Voice mode: Off";
}

/* =========================================================
   CHAT STORAGE
========================================================= */

function getChats() {

  try {

    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

  } catch {

    return [];
  }
}

function saveChats(chats) {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(chats)
  );
}

function saveCurrentChat() {

  if (!messages.length) return;

  const chats = getChats();

  let chat =
    chats.find(
      item => item.id === currentChatId
    );

  const firstUser =
    messages.find(
      item => item.role === "user"
    );

  const title =
    firstUser
      ? firstUser.text.slice(0, 45)
      : "New chat";

  if (!chat) {

    currentChatId =
      currentChatId ||
      crypto.randomUUID();

    chat = {
      id: currentChatId,
      title,
      messages: [],
      updatedAt: Date.now()
    };

    chats.unshift(chat);

  } else {

    chat.title = title;
    chat.updatedAt = Date.now();
  }

  /*
    Do not persist large base64 files.
    Only save attachment metadata.
  */

  chat.messages =
    messages.map(message => ({
      ...message,

      attachments:
        (message.attachments || [])
          .map(file => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size
          }))
    }));

  saveChats(chats);

  renderChatHistory();
}

function loadChats() {

  const chats = getChats();

  if (!chats.length) {
    startEmptyChat();
    return;
  }

  const first = chats[0];

  currentChatId = first.id;

  messages =
    first.messages || [];

  renderMessages();

  if (messages.length) {
    welcome.classList.add("hidden");
  }
}

function renderChatHistory() {

  const query =
    chatSearch.value.trim().toLowerCase();

  chatHistory.innerHTML = "";

  const chats =
    getChats()
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt
      )
      .filter(chat =>
        !query ||
        chat.title
          .toLowerCase()
          .includes(query)
      );

  chats.forEach(chat => {

    const button =
      document.createElement("button");

    button.className =
      "chat-item" +
      (
        chat.id === currentChatId
          ? " active"
          : ""
      );

    button.innerHTML = `
      <span>💬</span>
      <span class="chat-item-title">
        ${escapeHTML(chat.title)}
      </span>
    `;

    button.addEventListener(
      "click",
      () => loadChat(chat.id)
    );

    chatHistory.appendChild(button);
  });
}

function loadChat(id) {

  const chats = getChats();

  const chat =
    chats.find(
      item => item.id === id
    );

  if (!chat) return;

  currentChatId = chat.id;

  messages =
    chat.messages || [];

  pendingAttachments = [];

  renderAttachmentPreview();
  renderMessages();

  if (messages.length) {
    welcome.classList.add("hidden");
  } else {
    welcome.classList.remove("hidden");
  }

  renderChatHistory();

  closeSidebarMenu();
}

function newChat() {

  if (controller) {
    stopGeneration();
  }

  currentChatId = null;

  messages = [];
  pendingAttachments = [];

  messageInput.value = "";

  renderAttachmentPreview();
  renderMessages();

  welcome.classList.remove("hidden");

  autoResize();

  renderChatHistory();

  closeSidebarMenu();

  messageInput.focus();
}

function startEmptyChat() {

  currentChatId = null;
  messages = [];

  renderMessages();

  welcome.classList.remove("hidden");

  renderChatHistory();
}

function clearAllChats() {

  const confirmed =
    confirm(
      "Delete all saved chats?"
    );

  if (!confirmed) return;

  localStorage.removeItem(
    STORAGE_KEY
  );

  newChat();
}

/* =========================================================
   SIDEBAR
========================================================= */

function openSidebar() {

  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
}

function closeSidebarMenu() {

  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
}

/* =========================================================
   THEME
========================================================= */

function loadTheme() {

  const theme =
    localStorage.getItem(THEME_KEY);

  if (theme === "light") {

    document.body.classList.add("light");
    themeIcon.textContent = "☀";

  } else {

    document.body.classList.remove("light");
    themeIcon.textContent = "☾";
  }
}

function toggleTheme() {

  const light =
    document.body.classList.toggle("light");

  localStorage.setItem(
    THEME_KEY,
    light ? "light" : "dark"
  );

  themeIcon.textContent =
    light ? "☀" : "☾";
}

/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function shortFileName(name) {

  if (name.length <= 12) {
    return name;
  }

  return name.slice(0, 9) + "...";
}

function formatBytes(bytes) {

  if (!bytes) return "0 B";

  const units =
    ["B", "KB", "MB", "GB"];

  const index =
    Math.floor(
      Math.log(bytes) /
      Math.log(1024)
    );

  return (
    (bytes /
      Math.pow(1024, index))
      .toFixed(index ? 1 : 0)
    +
    " " +
    units[index]
  );
}

function getFileEmoji(mime) {

  if (!mime) return "📄";

  if (mime.startsWith("audio/")) return "🎵";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("image/")) return "🖼️";

  if (mime === "application/pdf") {
    return "📕";
  }

  return "📄";
      }
