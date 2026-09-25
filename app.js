const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");

const sendButton = document.getElementById("sendButton");
const newChat = document.getElementById("newChat");
const clearChat = document.getElementById("clearChat");

const menuButton = document.getElementById("menuButton");
const sidebar = document.getElementById("sidebar");

const historyList = document.getElementById("historyList");
const welcome = document.getElementById("welcome");

let messages = [];

let sending = false;


// ======================================================
// STORAGE
// ======================================================

function saveMessages() {
  localStorage.setItem(
    "abhay-singh-ai-chat",
    JSON.stringify(messages)
  );
}


function loadMessages() {

  try {

    const saved = localStorage.getItem(
      "abhay-singh-ai-chat"
    );

    if (!saved) return;

    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed)) {
      messages = parsed;
    }

  } catch {
    messages = [];
  }
}


// ======================================================
// HTML ESCAPE
// ======================================================

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ======================================================
// MARKDOWN
// ======================================================

function formatAI(text) {

  let html = escapeHTML(text);

  // Code blocks
  html = html.replace(
    /```([\w+-]*)\n?([\s\S]*?)```/g,
    (match, language, code) => {

      const lang =
        language || "code";

      return `
        <div class="code-block">

          <div class="code-header">

            <span>${escapeHTML(lang)}</span>

            <button
              class="code-copy"
              onclick="copyCode(this)"
            >
              Copy
            </button>

          </div>

          <pre><code>${code}</code></pre>

        </div>
      `;
    }
  );

  // Bold
  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  // Italic
  html = html.replace(
    /\*(.*?)\*/g,
    "<em>$1</em>"
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  // New lines
  html = html.replace(
    /\n/g,
    "<br>"
  );

  return html;
}


// ======================================================
// RENDER
// ======================================================

function render() {

  chat.innerHTML = "";

  if (messages.length === 0) {

    chat.appendChild(welcome);

    welcome.style.display = "block";

    historyList.innerHTML = "";

    return;
  }

  welcome.style.display = "none";

  messages.forEach(
    (message, index) => {

      const wrapper =
        document.createElement("div");

      wrapper.className =
        "message";

      if (message.role === "user") {

        wrapper.innerHTML = `

          <div class="avatar avatar-user">
            You
          </div>

          <div class="message-content">

            <div class="user-bubble">
              ${escapeHTML(message.text)}
            </div>

          </div>

        `;

      } else {

        wrapper.innerHTML = `

          <div class="avatar avatar-ai">
            A
          </div>

          <div class="message-content">

            <div class="ai-text">
              ${formatAI(message.text)}
            </div>

            <div class="message-actions">

              <button
                class="copy-button"
                onclick="copyMessage(${index})"
              >
                Copy
              </button>

            </div>

          </div>

        `;
      }

      chat.appendChild(wrapper);
    }
  );

  renderHistory();

  scrollBottom();
}


// ======================================================
// HISTORY
// ======================================================

function renderHistory() {

  historyList.innerHTML = "";

  const users =
    messages.filter(
      item => item.role === "user"
    );

  users
    .slice(-15)
    .reverse()
    .forEach(item => {

      const div =
        document.createElement("div");

      div.className =
        "history-item";

      div.textContent =
        item.text;

      div.onclick = () => {

        input.value =
          item.text;

        resizeInput();

        input.focus();

      };

      historyList.appendChild(div);
    });
}


// ======================================================
// SEND
// ======================================================

async function sendMessage() {

  if (sending) return;

  const text =
    input.value.trim();

  if (!text) return;

  sending = true;

  sendButton.disabled = true;

  messages.push({
    role: "user",
    text
  });

  input.value = "";

  resizeInput();

  saveMessages();

  render();


  // Loading
  const loading =
    document.createElement("div");

  loading.className =
    "message";

  loading.id =
    "loading";

  loading.innerHTML = `

    <div class="avatar avatar-ai">
      A
    </div>

    <div class="message-content">

      <div class="typing">
        <span></span>
        <span></span>
        <span></span>
      </div>

    </div>
  `;

  chat.appendChild(loading);

  scrollBottom();


  try {

    // Don't send the current message twice
    const history =
      messages
        .slice(0, -1)
        .map(item => ({
          role: item.role,
          text: item.text
        }));


    const response =
      await fetch("/api/chat", {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          message: text,
          history
        })

      });


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Request failed."
      );
    }


    if (!data.success) {

      throw new Error(
        data.error ||
        "AI response failed."
      );
    }


    loading.remove();


    messages.push({
      role: "assistant",
      text: data.message
    });

    saveMessages();

    render();


  } catch (error) {

    loading.remove();

    messages.push({
      role: "assistant",
      text:
        "⚠️ " +
        (error.message ||
          "Unable to connect to AI.")
    });

    saveMessages();

    render();

  } finally {

    sending = false;

    sendButton.disabled = false;

    input.focus();
  }
}


// ======================================================
// NEW CHAT
// ======================================================

function startNewChat() {

  messages = [];

  saveMessages();

  render();

  input.value = "";

  resizeInput();

  input.focus();

  sidebar.classList.remove("open");
}


// ======================================================
// CLEAR
// ======================================================

function clearCurrentChat() {

  if (!messages.length) return;

  if (
    !confirm(
      "Are you sure you want to clear this chat?"
    )
  ) {
    return;
  }

  startNewChat();
}


// ======================================================
// COPY
// ======================================================

async function copyMessage(index) {

  const message =
    messages[index];

  if (!message) return;

  try {

    await navigator.clipboard.writeText(
      message.text
    );

  } catch {}
}


async function copyCode(button) {

  const block =
    button.closest(".code-block");

  const code =
    block.querySelector("code");

  if (!code) return;

  try {

    await navigator.clipboard.writeText(
      code.innerText
    );

    button.textContent =
      "Copied";

    setTimeout(() => {

      button.textContent =
        "Copy";

    }, 1200);

  } catch {}
}


// ======================================================
// TEXTAREA
// ======================================================

function resizeInput() {

  input.style.height =
    "auto";

  input.style.height =
    Math.min(
      input.scrollHeight,
      180
    ) + "px";
}


// ======================================================
// SCROLL
// ======================================================

function scrollBottom() {

  setTimeout(() => {

    chat.scrollTo({
      top: chat.scrollHeight,
      behavior: "smooth"
    });

  }, 50);
}


// ======================================================
// ENTER
// ======================================================

input.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      sendMessage();
    }

  }
);


input.addEventListener(
  "input",
  resizeInput
);


sendButton.addEventListener(
  "click",
  sendMessage
);


newChat.addEventListener(
  "click",
  startNewChat
);


clearChat.addEventListener(
  "click",
  clearCurrentChat
);


menuButton.addEventListener(
  "click",
  () => {

    sidebar.classList.toggle(
      "open"
    );

  }
);


// ======================================================
// SUGGESTIONS
// ======================================================

document
  .querySelectorAll(
    ".suggestions button"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        input.value =
          button.dataset.prompt;

        resizeInput();

        input.focus();

      }
    );

  });


// ======================================================
// START
// ======================================================

loadMessages();

render();

input.focus();
