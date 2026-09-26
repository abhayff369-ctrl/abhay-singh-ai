/* =========================================================
   AURA AI — Frontend
   Developer: Abhay Singh
   API: /api/chat
   ========================================================= */

"use strict";

/* =========================================================
   AUTOMATIC SYSTEM THEME
   ========================================================= */

(function setupSystemTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme() {
    document.documentElement.setAttribute(
      "data-theme",
      media.matches ? "dark" : "light"
    );
  }

  applyTheme();

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", applyTheme);
  } else if (typeof media.addListener === "function") {
    media.addListener(applyTheme);
  }
})();

/* =========================================================
   ELEMENTS
   ========================================================= */

const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chat = document.getElementById("chat");
const chatInner = document.getElementById("chatInner");
const welcome = document.getElementById("welcome");

const newChatBtn = document.getElementById("newChatBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const voiceBtn = document.getElementById("voiceBtn");

const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const overlay = document.getElementById("overlay");

const historyList = document.getElementById("historyList");
const attachmentsBox = document.getElementById("attachments");

/* =========================================================
   CONSTANTS
   ========================================================= */

const STORAGE_KEY = "aura_ai_chats_v1";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TOTAL_SIZE = 12 * 1024 * 1024;

let chats = [];
let currentChat = null;

let selectedFiles = [];

let isGenerating = false;
let abortController = null;

let mediaRecorder = null;
let audioChunks = [];
let voiceTimer = null;
let voiceSeconds = 0;

/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function scrollToBottom(smooth = true) {
  if (!chat) return;

  chat.scrollTo({
    top: chat.scrollHeight,
    behavior: smooth ? "smooth" : "auto"
  });
}

/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function loadChats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      chats = [];
      return;
    }

    const parsed = JSON.parse(saved);

    chats = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("AURA AI: failed to load chats", error);
    chats = [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(chats)
    );
  } catch (error) {
    console.warn("AURA AI: failed to save chats", error);
  }
}

/* =========================================================
   CHAT CREATION
   ========================================================= */

function createChat() {
  const chatObject = {
    id: uid(),
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };

  chats.unshift(chatObject);
  currentChat = chatObject;

  saveChats();

  renderHistory();
  renderCurrentChat();

  closeSidebar();
}

/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";

  if (!chats.length) {
    const empty = document.createElement("div");

    empty.style.padding = "12px 8px";
    empty.style.color = "var(--muted)";
    empty.style.fontSize = "13px";

    empty.textContent = "No previous chats";

    historyList.appendChild(empty);
    return;
  }

  chats
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((item) => {
      const button = document.createElement("button");

      button.className = "history-item";
      button.type = "button";

      button.textContent =
        item.title || "New Chat";

      button.addEventListener("click", () => {
        currentChat = chats.find(
          (chatItem) => chatItem.id === item.id
        );

        renderCurrentChat();
        closeSidebar();
      });

      historyList.appendChild(button);
    });
}

/* =========================================================
   RENDER CURRENT CHAT
   ========================================================= */

function renderCurrentChat() {
  if (!chatInner) return;

  chatInner.innerHTML = "";

  if (!currentChat) {
    if (welcome) {
      welcome.style.display = "flex";
      chatInner.appendChild(welcome);
    }

    return;
  }

  if (welcome) {
    welcome.style.display = "none";
  }

  if (!currentChat.messages.length) {
    if (welcome) {
      welcome.style.display = "flex";
      chatInner.appendChild(welcome);
    }

    return;
  }

  currentChat.messages.forEach((message) => {
    renderMessage(
      message.role,
      message.content,
      false
    );
  });

  requestAnimationFrame(() => {
    scrollToBottom(false);
  });
}

/* =========================================================
   MARKDOWN-LIKE RENDERER
   ========================================================= */

function renderMarkdown(text) {
  let html = escapeHTML(text);

  /* Code blocks */
  html = html.replace(
    /```([\s\S]*?)```/g,
    (_, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    }
  );

  /* Inline code */
  html = html.replace(
    /`([^`\n]+)`/g,
    "<code>$1</code>"
  );

  /* Bold */
  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  /* Italic */
  html = html.replace(
    /(^|[^\*])\*([^*\n]+)\*(?!\*)/g,
    "$1<em>$2</em>"
  );

  /* Links */
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  /* Lists */
  html = html.replace(
    /(?:^|\n)- (.*?)(?=\n|$)/g,
    "<li>$1</li>"
  );

  html = html.replace(
    /(<li>.*?<\/li>)/gs,
    "<ul>$1</ul>"
  );

  /* Paragraphs / line breaks */
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (
        block.startsWith("<pre>") ||
        block.startsWith("<ul>")
      ) {
        return block;
      }

      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  return html;
}

/* =========================================================
   RENDER MESSAGE
   ========================================================= */

function renderMessage(
  role,
  content,
  save = true
) {
  if (!chatInner) return null;

  if (welcome) {
    welcome.style.display = "none";
  }

  const row = document.createElement("div");

  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");

  bubble.className = "message";

  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  row.appendChild(bubble);
  chatInner.appendChild(row);

  if (
    save &&
    currentChat &&
    typeof content === "string"
  ) {
    currentChat.messages.push({
      role,
      content,
      createdAt: Date.now()
    });

    currentChat.updatedAt = Date.now();

    saveChats();
    renderHistory();
  }

  scrollToBottom();

  return row;
}

/* =========================================================
   TYPING INDICATOR
   ========================================================= */

function showTyping() {
  const row = document.createElement("div");

  row.className = "message-row assistant";
  row.id = "auraTyping";

  const bubble = document.createElement("div");

  bubble.className = "message";

  bubble.innerHTML = `
    <div class="typing" aria-label="AURA AI is typing">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  row.appendChild(bubble);
  chatInner.appendChild(row);

  scrollToBottom();

  return row;
}

function removeTyping() {
  const typing = $("auraTyping");

  if (typing) {
    typing.remove();
  }
}

/* =========================================================
   SEND BUTTON STATE
   ========================================================= */

function setGeneratingState(value) {
  isGenerating = value;

  if (!sendBtn) return;

  if (value) {
    sendBtn.classList.add("stop");
    sendBtn.title = "Stop generating";
    sendBtn.setAttribute("aria-label", "Stop generating");

    sendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2"></rect>
      </svg>
    `;
  } else {
    sendBtn.classList.remove("stop");
    sendBtn.title = "Send message";
    sendBtn.setAttribute("aria-label", "Send message");

    sendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 2 11 13"></path>
        <path d="m22 2-7 20-4-9-9-4Z"></path>
      </svg>
    `;
  }
}

/* =========================================================
   AUTO RESIZE TEXTAREA
   ========================================================= */

function autoResizeTextarea() {
  if (!messageInput) return;

  messageInput.style.height = "auto";

  const maxHeight = 180;

  messageInput.style.height =
    Math.min(
      messageInput.scrollHeight,
      maxHeight
    ) + "px";
}

/* =========================================================
   FILE HANDLING
   ========================================================= */

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments() {
  if (!attachmentsBox) return;

  attachmentsBox.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const chip = document.createElement("div");

    chip.className = "attachment-chip";

    chip.innerHTML = `
      <span title="${escapeHTML(file.name)}">
        ${escapeHTML(file.name)}
      </span>
      <small>${formatBytes(file.size)}</small>
      <button
        type="button"
        class="attachment-remove"
        aria-label="Remove ${escapeHTML(file.name)}"
      >×</button>
    `;

    const removeButton =
      chip.querySelector(".attachment-remove");

    removeButton.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderAttachments();
    });

    attachmentsBox.appendChild(chip);
  });
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `${file.name} is too large. Maximum size is 8 MB.`
      );
      continue;
    }

    const currentTotal = selectedFiles.reduce(
      (sum, item) => sum + item.size,
      0
    );

    if (
      currentTotal + file.size >
      MAX_TOTAL_SIZE
    ) {
      alert("Total attachment size cannot exceed 12 MB.");
      break;
    }

    selectedFiles.push(file);
  }

  renderAttachments();
}

/* =========================================================
   FILE → BASE64
   ========================================================= */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");

      const commaIndex = result.indexOf(",");

      resolve(
        commaIndex >= 0
          ? result.slice(commaIndex + 1)
          : result
      );
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

async function prepareAttachments() {
  const result = [];

  for (const file of selectedFiles) {
    const data = await fileToBase64(file);

    result.push({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      data
    });
  }

  return result;
}

/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage() {
  if (isGenerating) {
    stopGeneration();
    return;
  }

  const text =
    messageInput?.value.trim() || "";

  if (!text && !selectedFiles.length) {
    return;
  }

  if (!currentChat) {
    createChat();
  }

  if (!currentChat) return;

  if (text && currentChat.title === "New Chat") {
    currentChat.title =
      text.length > 42
        ? text.slice(0, 42) + "…"
        : text;

    currentChat.updatedAt = Date.now();

    saveChats();
    renderHistory();
  }

  const files = selectedFiles.slice();

  /* User message */
  const displayText =
    text ||
    files
      .map((file) => `📎 ${file.name}`)
      .join("\n");

  renderMessage("user", displayText, true);

  /* Clear input */
  if (messageInput) {
    messageInput.value = "";
    autoResizeTextarea();
  }

  selectedFiles = [];
  renderAttachments();

  setGeneratingState(true);

  const typing = showTyping();

  abortController = new AbortController();

  try {
    const attachments =
      await prepareAttachmentsFrom(files);

    const payload = {
      message: text,
      attachments
    };

    const response = await fetch(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: abortController.signal
      }
    );

    const data = await response.json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `Request failed (${response.status})`
      );
    }

    removeTyping();

    const answer =
      data?.text ||
      data?.message ||
      "AURA AI did not return a response.";

    /* Save/render exactly once */
    renderMessage(
      "assistant",
      answer,
      true
    );

    speakAnswer(answer);
  } catch (error) {
    removeTyping();

    if (
      error?.name === "AbortError"
    ) {
      return;
    }

    console.error(
      "AURA AI API error:",
      error
    );

    renderMessage(
      "assistant",
      `⚠️ ${error?.message || "Something went wrong."}`,
      true
    );
  } finally {
    abortController = null;
    setGeneratingState(false);
  }
}

/* =========================================================
   PREPARE ATTACHMENTS
   ========================================================= */

async function prepareAttachmentsFrom(files) {
  const result = [];

  for (const file of files) {
    result.push({
      name: file.name,
      type:
        file.type ||
        "application/octet-stream",
      size: file.size,
      data: await fileToBase64(file)
    });
  }

  return result;
}

/* =========================================================
   STOP GENERATION
   ========================================================= */

function stopGeneration() {
  if (abortController) {
    abortController.abort();
  }

  removeTyping();

  setGeneratingState(false);
}

/* =========================================================
   NEW CHAT
   ========================================================= */

function handleNewChat() {
  if (isGenerating) {
    stopGeneration();
  }

  createChat();

  if (messageInput) {
    messageInput.focus();
  }
}

/* =========================================================
   KEYBOARD
   ========================================================= */

function handleInputKeydown(event) {
  if (event.key !== "Enter") return;

  if (event.shiftKey) {
    return;
  }

  if (event.isComposing) {
    return;
  }

  event.preventDefault();

  sendMessage();
}

/* =========================================================
   VOICE INPUT
   ========================================================= */

async function toggleVoice() {
  if (mediaRecorder) {
    stopVoiceRecording();
    return;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    alert(
      "Voice recording is not supported in this browser."
    );
    return;
  }

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    audioChunks = [];

    mediaRecorder =
      new MediaRecorder(stream);

    mediaRecorder.ondataavailable =
      (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

    mediaRecorder.onstop = () => {
      stream
        .getTracks()
        .forEach((track) => track.stop());

      mediaRecorder = null;

      if (voiceTimer) {
        clearInterval(voiceTimer);
        voiceTimer = null;
      }

      voiceSeconds = 0;

      if (voiceBtn) {
        voiceBtn.removeAttribute("data-recording");
        voiceBtn.title = "Voice input";
      }

      /*
       * Browser speech recognition is separate from
       * MediaRecorder. The recorded audio is not
       * automatically transcribed here.
       */
    };

    mediaRecorder.start();

    voiceSeconds = 0;

    if (voiceBtn) {
      voiceBtn.setAttribute(
        "data-recording",
        "true"
      );

      voiceBtn.title = "Stop recording";
    }

    voiceTimer = setInterval(() => {
      voiceSeconds++;

      if (voiceBtn) {
        voiceBtn.title =
          `Recording ${voiceSeconds}s`;
      }
    }, 1000);
  } catch (error) {
    console.error(error);

    alert(
      "Microphone permission is required."
    );
  }
}

function stopVoiceRecording() {
  if (
    mediaRecorder &&
    mediaRecorder.state !== "inactive"
  ) {
    mediaRecorder.stop();
  }
}

/* =========================================================
   TEXT-TO-SPEECH
   ========================================================= */

function speakAnswer(text) {
  if (
    !("speechSynthesis" in window) ||
    !text
  ) {
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(
        String(text).slice(0, 5000)
      );

    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(
      utterance
    );
  } catch (error) {
    console.warn(
      "Speech synthesis failed:",
      error
    );
  }
}

/* =========================================================
   MOBILE SIDEBAR
   ========================================================= */

function openSidebar() {
  sidebar?.classList.add("open");
  overlay?.classList.add("show");
}

function closeSidebar() {
  sidebar?.classList.remove("open");
  overlay?.classList.remove("show");
}

/* =========================================================
   EVENTS
   ========================================================= */

composer?.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    sendMessage();
  }
);

sendBtn?.addEventListener(
  "click",
  (event) => {
    event.preventDefault();
    sendMessage();
  }
);

messageInput?.addEventListener(
  "keydown",
  handleInputKeydown
);

messageInput?.addEventListener(
  "input",
  autoResizeTextarea
);

newChatBtn?.addEventListener(
  "click",
  handleNewChat
);

attachBtn?.addEventListener(
  "click",
  () => fileInput?.click()
);

fileInput?.addEventListener(
  "change",
  (event) => {
    addFiles(event.target.files);

    /* Allow selecting same file again */
    event.target.value = "";
  }
);

voiceBtn?.addEventListener(
  "click",
  toggleVoice
);

menuBtn?.addEventListener(
  "click",
  openSidebar
);

overlay?.addEventListener(
  "click",
  closeSidebar
);

/* Suggestion buttons */
document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(".suggestion");

    if (!button) return;

    const text =
      button.dataset.prompt ||
      button.textContent.trim();

    if (!messageInput) return;

    messageInput.value = text;

    autoResizeTextarea();

    messageInput.focus();
  }
);

/* =========================================================
   INITIALIZE
   ========================================================= */

loadChats();

if (chats.length) {
  currentChat =
    chats
      .slice()
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt
      )[0];

  renderHistory();
  renderCurrentChat();
} else {
  renderHistory();

  if (welcome) {
    welcome.style.display = "flex";
  }
}

autoResizeTextarea();

console.log(
  "AURA AI initialized successfully."
);
