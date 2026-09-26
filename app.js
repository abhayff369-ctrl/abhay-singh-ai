// ============================================================
// ABHAY SINGH AI
// Multimodal Frontend
// ============================================================

const $ = selector =>
  document.querySelector(selector);

const $$ = selector =>
  [...document.querySelectorAll(selector)];

// ------------------------------------------------------------
// State
// ------------------------------------------------------------

const state = {

  messages: [],

  attachments: [],

  chats:
    JSON.parse(
      localStorage.getItem("abhay_chats") || "[]"
    ),

  theme:
    localStorage.getItem("abhay_theme") || "dark",

  selectedModel:
    localStorage.getItem("abhay_model") ||
    "gemini-3.8-flash",

  recording: false,

  mediaRecorder: null,

  audioChunks: [],

  recognition: null,

  speaking: false
};

// ------------------------------------------------------------
// Elements
// ------------------------------------------------------------

const messageInput =
  $("#messageInput");

const sendBtn =
  $("#sendBtn");

const messagesEl =
  $("#messages");

const welcome =
  $("#welcome");

const attachmentPreview =
  $("#attachmentPreview");

const attachMenu =
  $("#attachMenu");

const toast =
  $("#toast");

// ------------------------------------------------------------
// Theme
// ------------------------------------------------------------

function applyTheme(theme) {

  if (theme === "system") {

    document.documentElement.removeAttribute(
      "data-theme"
    );

  } else {

    document.documentElement.setAttribute(
      "data-theme",
      theme
    );
  }

  state.theme = theme;

  localStorage.setItem(
    "abhay_theme",
    theme
  );
}

applyTheme(state.theme);

// ------------------------------------------------------------
// Toast
// ------------------------------------------------------------

let toastTimer;

function showToast(text) {

  clearTimeout(toastTimer);

  toast.textContent = text;

  toast.classList.add("show");

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// ------------------------------------------------------------
// Escape HTML
// ------------------------------------------------------------

function escapeHTML(text) {

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------------------------------------
// Simple Markdown renderer
// ------------------------------------------------------------

function renderMarkdown(text) {

  let html =
    escapeHTML(text);

  // Code blocks
  html =
    html.replace(
      /```([\s\S]*?)```/g,
      (_, code) => {

        return `
          <pre><code>${code.trim()}</code></pre>
        `;
      }
    );

  // Bold
  html =
    html.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );

  // Italic
  html =
    html.replace(
      /\*(.*?)\*/g,
      "<em>$1</em>"
    );

  // Inline code
  html =
    html.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );

  // Links
  html =
    html.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

  // New lines
  html =
    html.replace(/\n/g, "<br>");

  return html;
}

// ------------------------------------------------------------
// Format size
// ------------------------------------------------------------

function formatSize(bytes) {

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ------------------------------------------------------------
// File -> Base64
// ------------------------------------------------------------

function fileToBase64(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload = () => {

        const result =
          String(reader.result);

        const comma =
          result.indexOf(",");

        resolve(
          comma >= 0
            ? result.slice(comma + 1)
            : result
        );
      };

      reader.onerror = () =>
        reject(
          new Error(
            "Could not read file."
          )
        );

      reader.readAsDataURL(file);
    }
  );
}

// ------------------------------------------------------------
// Validate file
// ------------------------------------------------------------

const MAX_FILE_SIZE =
  12 * 1024 * 1024;

const MAX_TOTAL =
  15 * 1024 * 1024;

function validateFile(file) {

  if (!file) {
    return "Invalid file.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} is larger than 12 MB.`;
  }

  const allowed =
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    [
      "application/pdf",
      "text/plain",
      "text/csv",
      "text/html",
      "text/xml",
      "application/json",
      "application/xml"
    ].includes(file.type);

  if (!allowed) {
    return `${file.name}: unsupported file type.`;
  }

  return null;
}

// ------------------------------------------------------------
// Add files
// ------------------------------------------------------------

async function addFiles(fileList) {

  const files =
    [...fileList];

  for (const file of files) {

    const error =
      validateFile(file);

    if (error) {
      showToast(error);
      continue;
    }

    const currentSize =
      state.attachments.reduce(
        (sum, item) =>
          sum + item.size,
        0
      );

    if (
      currentSize + file.size >
      MAX_TOTAL
    ) {
      showToast(
        "Total attachments cannot exceed 15 MB."
      );

      break;
    }

    try {

      const data =
        await fileToBase64(file);

      state.attachments.push({
        id:
          crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now() + Math.random()),

        name: file.name,

        mimeType:
          file.type ||
          "application/octet-stream",

        size: file.size,

        data,

        preview:
          file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null
      });

    } catch (error) {

      showToast(
        error.message
      );
    }
  }

  renderAttachments();

  updateSendButton();
}

// ------------------------------------------------------------
// Render attachments
// ------------------------------------------------------------

function renderAttachments() {

  attachmentPreview.innerHTML = "";

  for (
    const attachment of state.attachments
  ) {

    const card =
      document.createElement("div");

    card.className =
      "attachment-card";

    if (
      !attachment.mimeType.startsWith(
        "image/"
      )
    ) {

      card.classList.add("file");

      card.innerHTML = `
        <strong>
          📄 ${escapeHTML(
            attachment.name
          )}
        </strong>

        <small>
          ${formatSize(
            attachment.size
          )}
        </small>

        <button
          class="remove-attachment"
          data-remove="${attachment.id}"
          aria-label="Remove attachment"
        >
          ×
        </button>
      `;

    } else {

      card.innerHTML = `
        <img
          src="${attachment.preview}"
          alt="${escapeHTML(
            attachment.name
          )}"
        >

        <button
          class="remove-attachment"
          data-remove="${attachment.id}"
          aria-label="Remove image"
        >
          ×
        </button>
      `;
    }

    attachmentPreview.appendChild(card);
  }
}

// ------------------------------------------------------------
// Remove attachment
// ------------------------------------------------------------

attachmentPreview.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "[data-remove]"
      );

    if (!button) return;

    const id =
      button.dataset.remove;

    const item =
      state.attachments.find(
        x => x.id === id
      );

    if (item?.preview) {
      URL.revokeObjectURL(
        item.preview
      );
    }

    state.attachments =
      state.attachments.filter(
        x => x.id !== id
      );

    renderAttachments();

    updateSendButton();
  }
);

// ------------------------------------------------------------
// Attach menu
// ------------------------------------------------------------

$("#attachBtn").addEventListener(
  "click",
  event => {

    event.stopPropagation();

    attachMenu.classList.toggle(
      "show"
    );
  }
);

document.addEventListener(
  "click",
  event => {

    if (
      !attachMenu.contains(event.target) &&
      event.target !== $("#attachBtn")
    ) {

      attachMenu.classList.remove(
        "show"
      );
    }
  }
);

// ------------------------------------------------------------
// File buttons
// ------------------------------------------------------------

$("#photoBtn").onclick = () => {

  attachMenu.classList.remove("show");

  $("#imageInput").click();
};

$("#cameraBtn").onclick = () => {

  attachMenu.classList.remove("show");

  $("#cameraInput").click();
};

$("#fileBtn").onclick = () => {

  attachMenu.classList.remove("show");

  $("#fileInput").click();
};

$("#voiceMessageBtn").onclick = () => {

  attachMenu.classList.remove("show");

  startAudioRecording();
};

$("#imageInput").addEventListener(
  "change",
  event => {

    addFiles(event.target.files);

    event.target.value = "";
  }
);

$("#cameraInput").addEventListener(
  "change",
  event => {

    addFiles(event.target.files);

    event.target.value = "";
  }
);

$("#fileInput").addEventListener(
  "change",
  event => {

    addFiles(event.target.files);

    event.target.value = "";
  }
);

// ------------------------------------------------------------
// Clipboard image paste
// ------------------------------------------------------------

document.addEventListener(
  "paste",
  event => {

    const items =
      [...(event.clipboardData?.items || [])];

    for (const item of items) {

      if (
        item.type.startsWith("image/")
      ) {

        const file =
          item.getAsFile();

        if (file) {
          addFiles([file]);

          showToast(
            "Image pasted successfully."
          );
        }
      }
    }
  }
);

// ------------------------------------------------------------
// Drag & drop
// ------------------------------------------------------------

const dragOverlay =
  document.createElement("div");

dragOverlay.className =
  "drag-overlay";

dragOverlay.innerHTML =
  "<strong>Drop files here</strong>";

Object.assign(
  dragOverlay.style,
  {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    display: "none",
    placeItems: "center",
    background: "rgba(0,0,0,.55)",
    backdropFilter: "blur(8px)",
    color: "white",
    fontSize: "24px"
  }
);

document.body.appendChild(
  dragOverlay
);

let dragCounter = 0;

document.addEventListener(
  "dragenter",
  event => {

    event.preventDefault();

    dragCounter++;

    dragOverlay.style.display =
      "grid";
  }
);

document.addEventListener(
  "dragover",
  event => {

    event.preventDefault();
  }
);

document.addEventListener(
  "dragleave",
  event => {

    event.preventDefault();

    dragCounter--;

    if (dragCounter <= 0) {

      dragCounter = 0;

      dragOverlay.style.display =
        "none";
    }
  }
);

document.addEventListener(
  "drop",
  event => {

    event.preventDefault();

    dragCounter = 0;

    dragOverlay.style.display =
      "none";

    if (
      event.dataTransfer?.files?.length
    ) {

      addFiles(
        event.dataTransfer.files
      );
    }
  }
);

// ------------------------------------------------------------
// Textarea
// ------------------------------------------------------------

function resizeTextarea() {

  messageInput.style.height =
    "auto";

  messageInput.style.height =
    Math.min(
      messageInput.scrollHeight,
      180
    ) + "px";
}

messageInput.addEventListener(
  "input",
  () => {

    resizeTextarea();

    updateSendButton();
  }
);

function updateSendButton() {

  sendBtn.disabled =
    !messageInput.value.trim() &&
    state.attachments.length === 0;
}

// ------------------------------------------------------------
// Add user message to UI
// ------------------------------------------------------------

function addUserMessage(
  text,
  attachments
) {

  welcome.style.display =
    "none";

  const message =
    document.createElement("div");

  message.className =
    "message user";

  let attachmentHTML = "";

  for (
    const attachment of attachments
  ) {

    if (
      attachment.mimeType.startsWith(
        "image/"
      )
    ) {

      attachmentHTML += `
        <img
          class="chat-image"
          src="${attachment.preview}"
          alt="${escapeHTML(
            attachment.name
          )}"
        >
      `;

    } else {

      attachmentHTML += `
        <div class="chat-file">
          <span>📄</span>

          <div>
            <strong>
              ${escapeHTML(
                attachment.name
              )}
            </strong>

            <small>
              ${formatSize(
                attachment.size
              )}
            </small>
          </div>
        </div>
      `;
    }
  }

  message.innerHTML = `
    <div class="message-avatar">
      You
    </div>

    <div class="message-body">

      <div class="message-content">
        ${attachmentHTML}

        ${
          text
            ? renderMarkdown(text)
            : ""
        }
      </div>

      <div class="message-actions">

        <button data-copy-message>
          Copy
        </button>

        <button data-edit-message>
          Edit
        </button>

      </div>

    </div>
  `;

  messagesEl.appendChild(
    message
  );

  scrollBottom();
}

// ------------------------------------------------------------
// AI message
// ------------------------------------------------------------

function addAIMessage(
  text,
  model
) {

  welcome.style.display =
    "none";

  const message =
    document.createElement("div");

  message.className =
    "message assistant";

  message.innerHTML = `
    <div class="message-avatar">
      A
    </div>

    <div class="message-body">

      <div class="message-content">
        ${renderMarkdown(text)}
      </div>

      <div class="message-actions">

        <button data-copy-message>
          Copy
        </button>

        <button data-speak>
          🔊 Listen
        </button>

        <button data-regenerate>
          Regenerate
        </button>

      </div>

      ${
        model
          ? `<small style="color:var(--muted);font-size:10px">
               ${escapeHTML(model)}
             </small>`
          : ""
      }

    </div>
  `;

  messagesEl.appendChild(
    message
  );

  scrollBottom();

  return message;
}

// ------------------------------------------------------------
// Loading
// ------------------------------------------------------------

function addLoading() {

  const loading =
    document.createElement("div");

  loading.id =
    "loadingMessage";

  loading.className =
    "message assistant";

  loading.innerHTML = `
    <div class="message-avatar">
      A
    </div>

    <div class="message-body">

      <div class="message-content">
        <span style="color:var(--muted)">
          Abhay Singh AI
          <span class="loading-dots">
            ● ● ●
          </span>
        </span>
      </div>

    </div>
  `;

  messagesEl.appendChild(
    loading
  );

  scrollBottom();

  return loading;
}

// ------------------------------------------------------------
// Scroll
// ------------------------------------------------------------

function scrollBottom() {

  const area =
    $("#chatArea");

  area.scrollTop =
    area.scrollHeight;
}

// ------------------------------------------------------------
// API request
// ------------------------------------------------------------

async function sendMessage() {

  const text =
    messageInput.value.trim();

  if (
    !text &&
    state.attachments.length === 0
  ) {
    return;
  }

  const outgoingAttachments =
    [...state.attachments];

  addUserMessage(
    text,
    outgoingAttachments
  );

  const oldHistory =
    state.messages.map(
      item => ({
        role: item.role,
        text: item.text
      })
    );

  const history =
    oldHistory.slice(-20);

  state.messages.push({
    role: "user",
    text
  });

  messageInput.value = "";

  resizeTextarea();

  state.attachments = [];

  renderAttachments();

  updateSendButton();

  const loading =
    addLoading();

  setComposerDisabled(true);

  try {

    const payload = {

      message: text,

      history,

      attachments:
        outgoingAttachments.map(
          item => ({
            name: item.name,
            mimeType: item.mimeType,
            size: item.size,
            data: item.data
          })
        )
    };

    const response =
      await fetch(
        "/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        }
      );

    let data;

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        `Server returned HTTP ${response.status}`
      );
    }

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.error ||
        `API error: ${response.status}`
      );
    }

    loading.remove();

    addAIMessage(
      data.message,
      data.model
    );

    state.messages.push({
      role: "assistant",
      text: data.message
    });

    saveCurrentChat();

  } catch (error) {

    loading.remove();

    addAIMessage(
      `⚠️ ${error.message}`
    );

  } finally {

    setComposerDisabled(
      false
    );

    messageInput.focus();
  }
}

// ------------------------------------------------------------
// Disable composer
// ------------------------------------------------------------

function setComposerDisabled(
  disabled
) {

  messageInput.disabled =
    disabled;

  $("#attachBtn").disabled =
    disabled;

  $("#micBtn").disabled =
    disabled;

  if (!disabled) {
    updateSendButton();
  }
}

// ------------------------------------------------------------
// Form submit
// ------------------------------------------------------------

$("#composer").addEventListener(
  "submit",
  event => {

    event.preventDefault();

    sendMessage();
  }
);

// ------------------------------------------------------------
// Enter to send
// ------------------------------------------------------------

messageInput.addEventListener(
  "keydown",
  event => {

    const enterSetting =
      $("#enterToSend").checked;

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      enterSetting
    ) {

      event.preventDefault();

      sendMessage();
    }
  }
);

// ------------------------------------------------------------
// Speech Recognition
// ------------------------------------------------------------

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

function startSpeechRecognition() {

  if (!SpeechRecognition) {

    showToast(
      "Voice input is not supported in this browser."
    );

    return;
  }

  const recognition =
    new SpeechRecognition();

  state.recognition =
    recognition;

  recognition.continuous =
    true;

  recognition.interimResults =
    true;

  recognition.lang =
    "hi-IN";

  $("#voiceStatus").classList.remove(
    "hidden"
  );

  $("#voiceStatusText").textContent =
    "Listening...";

  recognition.onresult =
    event => {

      let finalText = "";

      let interim = "";

      for (
        let i =
          event.resultIndex;
        i < event.results.length;
        i++
      ) {

        const transcript =
          event.results[i][0].transcript;

        if (
          event.results[i].isFinal
        ) {

          finalText += transcript;

        } else {

          interim += transcript;
        }
      }

      if (finalText) {

        messageInput.value +=
          (
            messageInput.value
              ? " "
              : ""
          ) + finalText;

        resizeTextarea();
        updateSendButton();
      }

      $("#voiceStatusText").textContent =
        interim ||
        "Listening...";
    };

  recognition.onerror =
    event => {

      showToast(
        "Voice input error: " +
        event.error
      );

      stopSpeechRecognition();
    };

  recognition.onend =
    () => {

      if (
        state.recognition
      ) {
        stopSpeechRecognition();
      }
    };

  recognition.start();
}

function stopSpeechRecognition() {

  try {
    state.recognition?.stop();
  } catch {}

  state.recognition =
    null;

  $("#voiceStatus").classList.add(
    "hidden"
  );
}

$("#micBtn").addEventListener(
  "click",
  () => {

    if (state.recognition) {

      stopSpeechRecognition();

    } else {

      startSpeechRecognition();
    }
  }
);

$("#stopVoice").addEventListener(
  "click",
  stopSpeechRecognition
);

// ------------------------------------------------------------
// Audio recording
// ------------------------------------------------------------

async function startAudioRecording() {

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    showToast(
      "Audio recording is not supported."
    );

    return;
  }

  try {

    const stream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true
        });

    let mimeType =
      "audio/webm";

    if (
      !MediaRecorder.isTypeSupported(
        "audio/webm"
      )
    ) {

      mimeType =
        "audio/mp4";
    }

    const recorder =
      new MediaRecorder(
        stream,
        { mimeType }
      );

    state.audioChunks = [];

    state.mediaRecorder =
      recorder;

    recorder.ondataavailable =
      event => {

        if (
          event.data.size > 0
        ) {
          state.audioChunks.push(
            event.data
          );
        }
      };

    recorder.onstop =
      async () => {

        stream
          .getTracks()
          .forEach(
            track =>
              track.stop()
          );

        const blob =
          new Blob(
            state.audioChunks,
            {
              type:
                recorder.mimeType
            }
          );

        const file =
          new File(
            [blob],
            `voice-${Date.now()}.webm`,
            {
              type:
                recorder.mimeType
            }
          );

        await addFiles([file]);

        showToast(
          "Voice message attached."
        );
      };

    recorder.start();

    state.recording = true;

    $("#voiceStatus").classList.remove(
      "hidden"
    );

    $("#voiceStatusText").textContent =
      "Recording voice message...";

  } catch (error) {

    showToast(
      "Microphone permission was denied or unavailable."
    );
  }
}

$("#stopVoice").addEventListener(
  "click",
  () => {

    if (
      state.mediaRecorder &&
      state.mediaRecorder.state !==
        "inactive"
    ) {

      state.mediaRecorder.stop();

      state.recording = false;

      $("#voiceStatus").classList.add(
        "hidden"
      );
    }

  }
);

// ------------------------------------------------------------
// AI text-to-speech
// ------------------------------------------------------------

function speakText(text) {

  if (
    !("speechSynthesis" in window)
  ) {

    showToast(
      "Text-to-speech is not supported."
    );

    return;
  }

  if (
    speechSynthesis.speaking
  ) {

    speechSynthesis.cancel();

    state.speaking = false;

    return;
  }

  const clean =
    text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*_#`]/g, "");

  const utterance =
    new SpeechSynthesisUtterance(
      clean
    );

  utterance.lang =
    /[\u0900-\u097F]/.test(clean)
      ? "hi-IN"
      : "en-US";

  utterance.rate =
    1;

  utterance.pitch =
    1;

  utterance.onend =
    () => {
      state.speaking = false;
    };

  state.speaking = true;

  speechSynthesis.speak(
    utterance
  );
}

// ------------------------------------------------------------
// Message actions
// ------------------------------------------------------------

messagesEl.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "button"
      );

    if (!button) return;

    const messageEl =
      button.closest(
        ".message"
      );

    if (!messageEl) return;

    const content =
      messageEl.querySelector(
        ".message-content"
      );

    const text =
      content?.innerText || "";

    if (
      button.hasAttribute(
        "data-copy-message"
      )
    ) {

      navigator.clipboard
        .writeText(text)
        .then(() =>
          showToast(
            "Copied to clipboard."
          )
        );

      return;
    }

    if (
      button.hasAttribute(
        "data-speak"
      )
    ) {

      speakText(text);

      return;
    }

    if (
      button.hasAttribute(
        "data-edit-message"
      )
    ) {

      messageInput.value =
        text;

      resizeTextarea();

      updateSendButton();

      messageInput.focus();

      return;
    }

    if (
      button.hasAttribute(
        "data-regenerate"
      )
    ) {

      const previousUser =
        [...state.messages]
          .reverse()
          .find(
            item =>
              item.role === "user"
          );

      if (previousUser) {

        messageInput.value =
          previousUser.text;

        updateSendButton();

        sendMessage();
      }
    }
  }
);

// ------------------------------------------------------------
// Image viewer
// ------------------------------------------------------------

messagesEl.addEventListener(
  "click",
  event => {

    if (
      !event.target.classList.contains(
        "chat-image"
      )
    ) return;

    $("#viewerImage").src =
      event.target.src;

    $("#imageViewer").classList.remove(
      "hidden"
    );
  }
);

$("#closeImageViewer").onclick =
  () => {

    $("#imageViewer").classList.add(
      "hidden"
    );
  };

// ------------------------------------------------------------
// Suggestions
// ------------------------------------------------------------

$$(".suggestion").forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        messageInput.value =
          button.dataset.prompt;

        resizeTextarea();

        updateSendButton();

        messageInput.focus();
      }
    );
  }
);

// ------------------------------------------------------------
// New chat
// ------------------------------------------------------------

function newChat() {

  saveCurrentChat();

  state.messages = [];

  state.attachments = [];

  messagesEl.innerHTML = "";

  welcome.style.display =
    "";

  renderAttachments();

  updateSendButton();

  messageInput.value = "";

  resizeTextarea();

  messageInput.focus();
}

$("#newChatBtn").onclick =
  newChat;

$("#topNewChat").onclick =
  newChat;

// ------------------------------------------------------------
// Save current chat
// ------------------------------------------------------------

function saveCurrentChat() {

  if (
    state.messages.length === 0
  ) return;

  const first =
    state.messages.find(
      item =>
        item.role === "user"
    );

  const title =
    first?.text?.slice(0, 60) ||
    "New chat";

  const chat = {

    id:
      Date.now(),

    title,

    messages:
      state.messages,

    updated:
      new Date().toISOString()
  };

  state.chats.unshift(
    chat
  );

  state.chats =
    state.chats.slice(0, 50);

  localStorage.setItem(
    "abhay_chats",
    JSON.stringify(
      state.chats
    )
  );

  renderHistory();
}

// ------------------------------------------------------------
// History
// ------------------------------------------------------------

function renderHistory(
  filter = ""
) {

  const list =
    $("#historyList");

  list.innerHTML = "";

  const chats =
    state.chats.filter(
      chat =>
        chat.title
          .toLowerCase()
          .includes(
            filter.toLowerCase()
          )
    );

  chats.forEach(
    chat => {

      const button =
        document.createElement(
          "button"
        );

      button.className =
        "history-item";

      button.textContent =
        chat.title;

      button.onclick =
        () => {

          loadChat(chat);
        };

      list.appendChild(
        button
      );
    }
  );
}

function loadChat(chat) {

  state.messages =
    [...chat.messages];

  messagesEl.innerHTML = "";

  welcome.style.display =
    "none";

  for (
    const message of
    state.messages
  ) {

    if (
      message.role === "user"
    ) {

      addUserMessage(
        message.text,
        []
      );

    } else {

      addAIMessage(
        message.text
      );
    }
  }

  scrollBottom();
}

renderHistory();

$("#chatSearch").addEventListener(
  "input",
  event => {

    renderHistory(
      event.target.value
    );
  }
);

// ------------------------------------------------------------
// Clear current chat
// ------------------------------------------------------------

$("#clearChat").onclick =
  () => {

    messagesEl.innerHTML = "";

    state.messages = [];

    welcome.style.display =
      "";

    $("#moreBtn").click();

    showToast(
      "Current chat cleared."
    );
  };

// ------------------------------------------------------------
// Delete history
// ------------------------------------------------------------

$("#deleteHistory").onclick =
  () => {

    state.chats = [];

    localStorage.removeItem(
      "abhay_chats"
    );

    renderHistory();

    $("#moreBtn").click();

    showToast(
      "Chat history deleted."
    );
  };

// ------------------------------------------------------------
// Export
// ------------------------------------------------------------

$("#exportChat").onclick =
  () => {

    if (
      state.messages.length === 0
    ) {

      showToast(
        "No chat to export."
      );

      return;
    }

    const text =
      state.messages
        .map(
          item =>
            `${
              item.role === "user"
                ? "You"
                : "Abhay Singh AI"
            }:\n${item.text}`
        )
        .join(
          "\n\n----------------\n\n"
        );

    const blob =
      new Blob(
        [text],
        {
          type:
            "text/plain;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download =
      `abhay-singh-ai-${Date.now()}.txt`;

    a.click();

    URL.revokeObjectURL(url);

    $("#moreBtn").click();

    showToast(
      "Chat exported."
    );
  };

// ------------------------------------------------------------
// Model dropdown
// ------------------------------------------------------------

$("#modelBtn").onclick =
  event => {

    event.stopPropagation();

    $("#modelMenu")
      .classList.toggle(
        "show"
      );
  };

$$("[data-model]").forEach(
  button => {

    button.onclick =
      () => {

        state.selectedModel =
          button.dataset.model;

        localStorage.setItem(
          "abhay_model",
          state.selectedModel
        );

        $("#modelBtn span")
          .firstElementChild
          .textContent =
            button.querySelector(
              "strong"
            ).textContent;

        $("#modelMenu")
          .classList.remove(
            "show"
          );
      };
  }
);

// ------------------------------------------------------------
// More menu
// ------------------------------------------------------------

$("#moreBtn").onclick =
  event => {

    event.stopPropagation();

    $("#moreMenu")
      .classList.toggle(
        "show"
      );
  };

// ------------------------------------------------------------
// Close dropdowns
// ------------------------------------------------------------

document.addEventListener(
  "click",
  () => {

    $("#modelMenu")
      .classList.remove(
        "show"
      );

    $("#moreMenu")
      .classList.remove(
        "show"
      );
  }
);

// ------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------

function openSidebar() {

  $("#sidebar")
    .classList.add("open");

  $("#sidebarBackdrop")
    .classList.add("show");
}

function closeSidebar() {

  $("#sidebar")
    .classList.remove("open");

  $("#sidebarBackdrop")
    .classList.remove("show");
}

$("#menuBtn").onclick =
  openSidebar;

$("#closeSidebar").onclick =
  closeSidebar;

$("#sidebarBackdrop").onclick =
  closeSidebar;

// ------------------------------------------------------------
// Theme
// ------------------------------------------------------------

function toggleTheme() {

  applyTheme(
    state.theme === "dark"
      ? "light"
      : "dark"
  );
}

$("#themeBtn").onclick =
  toggleTheme;

$("#topTheme").onclick =
  toggleTheme;

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

$("#settingsBtn").onclick =
  () => {

    $("#settingsModal")
      .classList.remove(
        "hidden"
      );
  };

$("#closeSettings").onclick =
  () => {

    $("#settingsModal")
      .classList.add(
        "hidden"
      );
  };

$$("[data-theme-choice]").forEach(
  button => {

    button.onclick =
      () => {

        applyTheme(
          button.dataset.themeChoice
        );
      };
  }
);

// ------------------------------------------------------------
// Initialize
// ------------------------------------------------------------

updateSendButton();

resizeTextarea();

messageInput.focus();
