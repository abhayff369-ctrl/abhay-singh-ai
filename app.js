/* ============================================================
   AURA AI — app.js
   Developer: Abhay Singh
   ============================================================ */

(() => {
  'use strict';

  // ---------- CONSTANTS ----------
  const STORAGE = {
    THEME: 'aura.theme',
    CHATS: 'aura.chats',
    CURRENT: 'aura.current',
    SETTINGS: 'aura.settings'
  };
  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const ACCEPTED_IMAGE = /^image\//;
  const ACCEPTED_DOC = /\.(pdf|txt|json|csv|md|log|js|ts|py|html|css|xml|yaml|yml)$/i;

  // ---------- STATE ----------
  const state = {
    conversations: [],
    currentId: null,
    model: 'flash',
    isGenerating: false,
    abortController: null,
    attachments: [],
    settings: {
      theme: 'dark',
      enterToSend: true,
      voiceMode: false
    },
    composing: false,
    mediaRecorder: null,
    recordedChunks: [],
    recordingStart: 0,
    recordingTimer: null
  };

  // ---------- DOM ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const dom = {
    sidebar: $('#sidebar'),
    menuBackdrop: $('#menuBackdrop'),
    menuBtn: $('#menuBtn'),
    sidebarClose: $('#sidebarClose'),
    newChatBtn: $('#newChatBtn'),
    headerNewChat: $('#headerNewChat'),
    searchInput: $('#searchInput'),
    searchClear: $('#searchClear'),
    chatHistory: $('#chatHistory'),
    settingsBtn: $('#settingsBtn'),
    themeBtn: $('#themeBtn'),
    themeIcon: $('#themeIcon'),
    clearAllBtn: $('#clearAllBtn'),

    modelBadge: $('#modelBadge'),
    modelMenu: $('#modelMenu'),
    modelLabel: $('#modelLabel'),
    statusPill: $('#statusPill'),

    welcome: $('#welcome'),
    messages: $('#messages'),
    chatScroll: $('#chatScroll'),

    composer: $('#composer'),
    composerInput: $('#composerInput'),
    sendBtn: $('#sendBtn'),
    attachBtn: $('#attachBtn'),
    attachMenu: $('#attachMenu'),
    imageInput: $('#imageInput'),
    fileInput: $('#fileInput'),
    micBtn: $('#micBtn'),
    attachments: $('#attachments'),
    charCounter: $('#charCounter'),

    recordingOverlay: $('#recordingOverlay'),
    recordingTime: $('#recordingTime'),
    recordingCancel: $('#recordingCancel'),
    recordingSend: $('#recordingSend'),

    lightbox: $('#lightbox'),
    lightboxImg: $('#lightboxImg'),
    lightboxClose: $('#lightboxClose'),

    settingsModal: $('#settingsModal'),
    settingsClose: $('#settingsClose'),
    themeSegmented: $('#themeSegmented'),
    switchEnter: $('#switchEnter'),
    switchVoiceMode: $('#switchVoiceMode'),
    clearFromSettings: $('#clearFromSettings'),

    toasts: $('#toasts')
  };

  // ---------- UTILS ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const formatBytes = (n) => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(1024));
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  };
  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const debounce = (fn, ms = 200) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const dateGroup = (ts) => {
    const now = new Date();
    const d = new Date(ts);
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86400000;
    const startWeek = startToday - 7 * 86400000;
    if (d.getTime() >= startToday) return 'Today';
    if (d.getTime() >= startYesterday) return 'Yesterday';
    if (d.getTime() >= startWeek) return 'Previous 7 days';
    return 'Older';
  };

  // ---------- TOASTS ----------
  function toast(message, kind = 'info', ms = 2800) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
    dom.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 240);
    }, ms);
  }

  // ---------- STORAGE ----------
  function load() {
    try {
      const chats = JSON.parse(localStorage.getItem(STORAGE.CHATS) || '[]');
      if (Array.isArray(chats)) state.conversations = chats;
    } catch { state.conversations = []; }
    state.currentId = localStorage.getItem(STORAGE.CURRENT) || null;
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE.SETTINGS) || '{}');
      Object.assign(state.settings, s);
    } catch {}
    const theme = localStorage.getItem(STORAGE.THEME);
    if (theme) state.settings.theme = theme;
  }
  function saveChats() {
    try { localStorage.setItem(STORAGE.CHATS, JSON.stringify(state.conversations)); } catch {}
  }
  function saveCurrent() {
    if (state.currentId) localStorage.setItem(STORAGE.CURRENT, state.currentId);
    else localStorage.removeItem(STORAGE.CURRENT);
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE.SETTINGS, JSON.stringify(state.settings)); } catch {}
  }

  // ---------- THEME ----------
  function applyTheme(mode) {
    let effective = mode;
    if (mode === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
    state.settings.theme = mode;
    localStorage.setItem(STORAGE.THEME, mode);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effective === 'dark' ? '#0a0a0d' : '#f7f8fc';

    if (dom.themeIcon) {
      dom.themeIcon.innerHTML = effective === 'dark'
        ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
        : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
    $$('#themeSegmented button').forEach(b => b.classList.toggle('active', b.dataset.value === mode));
  }

  // ---------- MARKDOWN ----------
  function renderMarkdown(src) {
    if (!src) return '';
    let text = String(src).replace(/\r\n/g, '\n');
    const codeBlocks = [];
    text = text.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'code', code });
      return `\u0000CB${idx}\u0000`;
    });
    text = escapeHtml(text);
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, '$1<em>$2</em>');
    text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.split(/\n{2,}/).map(block => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h[1-3]|ul|ol|blockquote|pre|table|div)/.test(t)) return t;
      if (t.startsWith('\u0000CB')) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    text = text.replace(/\u0000CB(\d+)\u0000/g, (_, i) => {
      const { lang, code } = codeBlocks[+i];
      const id = 'code-' + uid();
      return `<div class="code-wrap">
        <div class="code-head">
          <span>${escapeHtml(lang)}</span>
          <button class="code-copy" type="button" data-code-id="${id}" aria-label="Copy code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
        <pre><code id="${id}">${escapeHtml(code)}</code></pre>
      </div>`;
    });
    return text;
  }

  // ---------- CONVERSATIONS ----------
  function createConversation() {
    const conv = {
      id: uid(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.conversations.unshift(conv);
    state.currentId = conv.id;
    saveChats(); saveCurrent();
    return conv;
  }
  function getCurrent() {
    return state.conversations.find(c => c.id === state.currentId) || null;
  }
  function switchTo(id) {
    state.currentId = id;
    saveCurrent();
    renderHistory();
    renderMessages();
    closeSidebar();
  }
  function deleteConversation(id) {
    const i = state.conversations.findIndex(c => c.id === id);
    if (i < 0) return;
    state.conversations.splice(i, 1);
    if (state.currentId === id) {
      state.currentId = state.conversations[0]?.id || null;
      if (!state.currentId) createConversation();
    }
    saveChats(); saveCurrent();
    renderHistory();
    renderMessages();
    toast('Conversation deleted', 'success');
  }
  function renameConversation(id, title) {
    const c = state.conversations.find(c => c.id === id);
    if (!c) return;
    c.title = title.slice(0, 80) || 'Untitled';
    c.updatedAt = Date.now();
    saveChats();
    renderHistory();
  }
  function startNewChat() {
    const cur = getCurrent();
    if (cur && cur.messages.length === 0) {
      dom.composerInput.focus();
      return;
    }
    createConversation();
    renderHistory();
    renderMessages();
    dom.composerInput.value = '';
    autoResize();
    updateComposerState();
    dom.composerInput.focus();
    closeSidebar();
    toast('New chat started', 'success');
  }

  // ---------- RENDER: HISTORY ----------
  function renderHistory(filter = '') {
    const q = filter.trim().toLowerCase();
    const convs = state.conversations
      .filter(c => !q || c.title.toLowerCase().includes(q) ||
        c.messages.some(m => (m.content || '').toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (convs.length === 0) {
      dom.chatHistory.innerHTML = `<div class="hist-empty">${q ? 'No matching conversations' : 'No conversations yet'}</div>`;
      return;
    }
    const groups = {};
    convs.forEach(c => {
      const g = dateGroup(c.updatedAt);
      (groups[g] = groups[g] || []).push(c);
    });
    const order = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];
    let html = '';
    order.forEach(label => {
      if (!groups[label]) return;
      html += `<div class="hist-group"><div class="hist-label">${label}</div>`;
      groups[label].forEach(c => {
        const active = c.id === state.currentId ? ' active' : '';
        const title = escapeHtml(c.title || 'New chat');
        html += `<div class="hist-item${active}" data-id="${c.id}" role="button" tabindex="0" aria-label="Open conversation: ${title}">
          <svg class="hi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="hi-title">${title}</span>
          <button class="hi-menu" type="button" data-menu="${c.id}" aria-label="Options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>`;
      });
      html += `</div>`;
    });
    dom.chatHistory.innerHTML = html;
  }

  // ---------- RENDER: MESSAGES ----------
  function renderMessages() {
    const conv = getCurrent();
    const has = conv && conv.messages.length > 0;
    dom.welcome.hidden = has;
    dom.messages.hidden = !has;
    if (!has) { dom.messages.innerHTML = ''; return; }

    dom.messages.innerHTML = conv.messages.map((m, i) => renderMessage(m, i)).join('');
    decorateErrorMessages();

    requestAnimationFrame(() => {
      dom.chatScroll.scrollTop = dom.chatScroll.scrollHeight;
    });
  }

  function renderMessage(m, idx) {
    const isUser = m.role === 'user';
    const name = isUser ? 'You' : 'AURA AI';
    const avatar = isUser
      ? '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-3.34 0-10 1.67-10 5v1h20v-1c0-3.33-6.66-5-10-5Z"/></svg>'
      : '✦';

    const attachHtml = (m.attachments && m.attachments.length)
      ? `<div class="msg-attachments">${m.attachments.map(a => renderMessageAttachment(a)).join('')}</div>`
      : '';

    const bodyHtml = isUser
      ? `<div class="msg-content">${escapeHtml(m.content || '')}</div>`
      : `<div class="msg-content">${renderMarkdown(m.content || '')}</div>`;

    const actions = isUser
      ? `<div class="msg-actions">
          <button class="msg-action" type="button" data-action="copy" data-idx="${idx}" aria-label="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
          <button class="msg-action" type="button" data-action="resend" data-idx="${idx}" aria-label="Edit and resend">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
            Edit
          </button>
        </div>`
      : `<div class="msg-actions">
          <button class="msg-action" type="button" data-action="copy" data-idx="${idx}" aria-label="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
          <button class="msg-action" type="button" data-action="speak" data-idx="${idx}" aria-label="Speak">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            Speak
          </button>
          <button class="msg-action" type="button" data-action="regenerate" data-idx="${idx}" aria-label="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 18.36 5.64L23 10"/></svg>
            Regenerate
          </button>
        </div>`;

    return `<div class="msg ${isUser ? 'user' : 'assistant'}" data-idx="${idx}">
      <div class="msg-avatar" aria-hidden="true">${avatar}</div>
      <div class="msg-body">
        <div class="msg-name">${name} <span class="time">${formatTime(m.timestamp || Date.now())}</span></div>
        ${attachHtml}
        ${bodyHtml}
        ${actions}
      </div>
    </div>`;
  }

  function renderMessageAttachment(a) {
    if (a.kind === 'image' && a.dataUrl) {
      return `<div class="msg-attach"><img src="${a.dataUrl}" alt="${escapeHtml(a.name)}" data-lightbox="${a.dataUrl}" loading="lazy" /></div>`;
    }
    return `<div class="msg-attach"><div class="msg-attach-file">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      <span>${escapeHtml(a.name)}</span>
    </div></div>`;
  }

  // ---------- COMPOSER STATE ----------
  function autoResize() {
    const ta = dom.composerInput;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

  function updateComposerState() {
    const hasText = dom.composerInput.value.trim().length > 0;
    const hasAttachments = state.attachments.length > 0;
    const canSend = (hasText || hasAttachments) && !state.isGenerating;

    dom.sendBtn.disabled = !canSend && !state.isGenerating;

    if (state.isGenerating) {
      dom.sendBtn.disabled = false;
      dom.sendBtn.classList.add('generating');
      dom.sendBtn.setAttribute('aria-label', 'Stop generating');
      dom.sendBtn.setAttribute('title', 'Stop generating');
    } else {
      dom.sendBtn.classList.remove('generating');
      dom.sendBtn.setAttribute('aria-label', 'Send message');
      dom.sendBtn.setAttribute('title', 'Send message');
    }

    const count = dom.composerInput.value.length;
    dom.charCounter.textContent = count > 3500 ? `${count} / 12000` : '';
  }

  // ---------- ATTACHMENTS ----------
  function addAttachments(files) {
    const added = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) { toast(`${f.name} is too large (max ${formatBytes(MAX_FILE_SIZE)})`, 'error'); continue; }
      const isImage = ACCEPTED_IMAGE.test(f.type);
      const isDoc = ACCEPTED_DOC.test(f.name) || f.type === 'application/pdf';
      if (!isImage && !isDoc) { toast(`${f.name}: unsupported file type`, 'error'); continue; }
      added.push({ id: uid(), file: f, name: f.name, size: f.size, type: f.type, kind: isImage ? 'image' : 'file' });
    }
    state.attachments.push(...added);
    renderAttachments();
    updateComposerState();
  }

  function renderAttachments() {
    if (!state.attachments.length) {
      dom.attachments.hidden = true;
      dom.attachments.innerHTML = '';
      return;
    }
    dom.attachments.hidden = false;
    dom.attachments.innerHTML = state.attachments.map(a => {
      const preview = a.kind === 'image' && a.dataUrl ? `<img src="${a.dataUrl}" alt="" />` : '';
      return `<div class="attach-chip" data-id="${a.id}">
        ${preview}
        <div class="attach-chip-info">
          <div class="attach-chip-name">${escapeHtml(a.name)}</div>
          <div class="attach-chip-size">${formatBytes(a.size)}</div>
        </div>
        <button class="attach-chip-remove" type="button" data-remove="${a.id}" aria-label="Remove attachment">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function addAttachmentsAndPreview(files) {
    const before = state.attachments.length;
    addAttachments(files);
    const newly = state.attachments.slice(before);
    await Promise.all(newly.filter(a => a.kind === 'image').map(async a => {
      try { a.dataUrl = await readAsDataUrl(a.file); } catch {}
    }));
    renderAttachments();
  }

  // ---------- SEND ----------
  async function sendMessage() {
    if (state.isGenerating) return;
    const text = dom.composerInput.value.trim();
    if (!text && state.attachments.length === 0) return;

    const conv = getCurrent() || createConversation();

    const atts = state.attachments.map(a => ({
      id: a.id, name: a.name, size: a.size, type: a.type, kind: a.kind, dataUrl: a.dataUrl || null
    }));

    conv.messages.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
      attachments: atts
    });
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = (text || atts[0]?.name || 'New chat').slice(0, 60);
    }
    conv.updatedAt = Date.now();
    saveChats();

    dom.composerInput.value = '';
    state.attachments = [];
    renderAttachments();
    autoResize();
    updateComposerState();

    renderMessages();
    renderHistory();

    state.isGenerating = true;
    updateComposerState();
    showThinking();

    const history = conv.messages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content || ''
    }));

    state.abortController = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || '(attachment)',
          history,
          model: state.model
        }),
        signal: state.abortController.signal
      });

      let data = null;
      try { data = await res.json(); } catch {}

      hideThinking();

      if (!res.ok || !data || data.success === false) {
        const errText = (data && (data.error || data.message)) ||
          `Request failed (${res.status}${res.statusText ? ' ' + res.statusText : ''})`;
        pushAssistantError(conv, errText);
      } else {
        const reply = data.message || data.reply || data.content || '';
        if (!reply) {
          pushAssistantError(conv, 'Empty response from server.');
        } else {
          conv.messages.push({
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
            model: data.model || state.model
          });
          conv.updatedAt = Date.now();
          saveChats();
          renderMessages();
          renderHistory();
          if (state.settings.voiceMode) speak(reply);
        }
      }
    } catch (err) {
      hideThinking();
      if (err.name === 'AbortError') {
        conv.messages.push({
          role: 'assistant',
          content: '(Response stopped)',
          timestamp: Date.now()
        });
        saveChats();
        renderMessages();
      } else {
        pushAssistantError(conv, 'Network error. Please check your connection and try again.');
      }
    } finally {
      state.isGenerating = false;
      state.abortController = null;
      updateComposerState();
      dom.composerInput.focus();
    }
  }

  function pushAssistantError(conv, message) {
    conv.messages.push({
      role: 'assistant',
      error: true,
      content: message,
      timestamp: Date.now()
    });
    saveChats();
    renderMessages();
  }

  function showThinking() {
    if (document.getElementById('thinkingMsg')) return;
    const el = document.createElement('div');
    el.id = 'thinkingMsg';
    el.className = 'msg assistant';
    el.innerHTML = `
      <div class="msg-avatar" aria-hidden="true">✦</div>
      <div class="msg-body">
        <div class="msg-name">AURA AI</div>
        <div class="thinking">
          <span class="thinking-star">✦</span>
          <span class="thinking-text">Thinking<span class="thinking-dots"><span></span><span></span><span></span></span></span>
        </div>
      </div>`;
    dom.messages.appendChild(el);
    dom.chatScroll.scrollTop = dom.chatScroll.scrollHeight;
  }
  function hideThinking() {
    document.getElementById('thinkingMsg')?.remove();
  }

  function decorateErrorMessages() {
    $$('.msg.assistant').forEach(el => {
      const idx = +el.dataset.idx;
      const conv = getCurrent();
      const m = conv?.messages[idx];
      if (!m || !m.error) return;
      const contentEl = el.querySelector('.msg-content');
      if (!contentEl || contentEl.dataset.errored) return;
      contentEl.dataset.errored = '1';
      contentEl.innerHTML = `
        <div class="error-card">
          <div class="error-card-icon">⚠️</div>
          <div>
            <div class="error-card-title">AURA AI couldn't complete that request.</div>
            <div class="error-card-desc">${escapeHtml(m.content)}</div>
            <button class="retry-btn" type="button" data-retry="${idx}">Try again</button>
          </div>
        </div>`;
    });
  }

  // ---------- VOICE ----------
  async function toggleRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast('Voice recording is not supported in this browser.', 'warn');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      state.mediaRecorder = rec;
      state.recordedChunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) state.recordedChunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        state.mediaRecorder = null;
      };
      rec.start();
      state.recordingStart = Date.now();
      dom.recordingOverlay.hidden = false;
      dom.recordingOverlay.style.display = 'flex';
      dom.micBtn.classList.add('recording');
      dom.micBtn.setAttribute('aria-pressed', 'true');
      state.recordingTimer = setInterval(() => {
        const s = Math.floor((Date.now() - state.recordingStart) / 1000);
        dom.recordingTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 250);
    } catch (err) {
      if (err.name === 'NotAllowedError') toast('Microphone permission denied.', 'error');
      else toast('Unable to start voice recording.', 'error');
    }
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.stop();
    }
    clearInterval(state.recordingTimer);
    dom.recordingOverlay.hidden = true;
    dom.recordingOverlay.style.display = '';
    dom.micBtn.classList.remove('recording');
    dom.micBtn.setAttribute('aria-pressed', 'false');
  }

  function cancelRecording() {
    state.recordedChunks = [];
    stopRecording();
    toast('Recording discarded', 'info');
  }

  async function sendRecording() {
    const chunks = state.recordedChunks.slice();
    stopRecording();
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
    state.attachments.push({ id: uid(), file, name: file.name, size: file.size, type: file.type, kind: 'file' });
    renderAttachments();
    updateComposerState();
    toast('Voice note attached', 'success');
  }

  function pickVoice(text) {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (!voices.length) return null;
    const isHindi = /[\u0900-\u097F]/.test(text);
    if (isHindi) return voices.find(v => /hi-IN/i.test(v.lang)) || voices.find(v => /hi/i.test(v.lang)) || null;
    return voices.find(v => /en-US/i.test(v.lang)) || voices.find(v => /en-GB/i.test(v.lang)) ||
      voices.find(v => /en/i.test(v.lang)) || voices[0];
  }
  function speak(text) {
    if (!window.speechSynthesis || !text) {
      toast('Speech playback is not supported in this browser.', 'warn');
      return;
    }
    window.speechSynthesis.cancel();
    const clean = String(text).replace(/```[\s\S]*?```/g, ' code block ').replace(/[*_`#>]/g, '');
    const u = new SpeechSynthesisUtterance(clean.slice(0, 4000));
    const v = pickVoice(clean);
    if (v) u.voice = v;
    u.rate = 1; u.pitch = 1;
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() { window.speechSynthesis?.cancel(); }

  // ---------- SIDEBAR ----------
  function openSidebar() {
    if (window.innerWidth <= 860) {
      dom.sidebar.classList.add('open');
      dom.menuBackdrop.classList.add('visible');
      dom.menuBtn.setAttribute('aria-expanded', 'true');
      dom.sidebar.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }
  function closeSidebar() {
    if (window.innerWidth <= 860) {
      dom.sidebar.classList.remove('open');
      dom.menuBackdrop.classList.remove('visible');
      dom.menuBtn.setAttribute('aria-expanded', 'false');
      dom.sidebar.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  // ---------- MODEL ----------
  function setModel(m) {
    state.model = m;
    const labels = { flash: 'AURA · Flash', pro: 'AURA · Pro', auto: 'AURA · Auto' };
    dom.modelLabel.textContent = labels[m] || labels.flash;
    $$('.model-item').forEach(it => {
      const on = it.dataset.model === m;
      it.classList.toggle('selected', on);
      it.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    dom.modelMenu.classList.remove('open');
    dom.modelBadge.setAttribute('aria-expanded', 'false');
    toast(`Model: ${labels[m]}`, 'success');
  }

  // ---------- SETTINGS MODAL ----------
  function openSettings() {
    dom.settingsModal.hidden = false;
    dom.settingsModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function closeSettings() {
    dom.settingsModal.hidden = true;
    dom.settingsModal.style.display = '';
    document.body.style.overflow = '';
  }

  // ---------- LIGHTBOX ----------
  function openLightbox(src) {
    dom.lightboxImg.src = src;
    dom.lightbox.hidden = false;
    dom.lightbox.style.display = 'flex';
  }
  function closeLightbox() {
    dom.lightbox.hidden = true;
    dom.lightbox.style.display = '';
    dom.lightboxImg.src = '';
  }

  // ---------- REGENERATE ----------
  async function regenerateFrom(idx) {
    const conv = getCurrent();
    if (!conv || state.isGenerating) return;
    const target = conv.messages[idx];
    if (!target) return;
    conv.messages = conv.messages.slice(0, idx);
    saveChats();
    renderMessages();

    const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;

    dom.composerInput.value = lastUser.content || '';
    autoResize(); updateComposerState();

    conv.messages = conv.messages.slice(0, -1);
    saveChats();
    renderMessages();
    sendMessage();
  }

  // ---------- HISTORY CONTEXT MENU ----------
  function openHistoryMenu(anchor, id) {
    document.getElementById('ctxMenu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'ctxMenu';
    menu.style.cssText = `
      position:fixed; z-index:500;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius:12px;
      box-shadow: var(--shadow-lg);
      padding:6px; min-width:170px;
      animation: fadeUp .18s var(--ease-soft);
    `;
    const conv = state.conversations.find(c => c.id === id);
    menu.innerHTML = `
      <button class="attach-item" type="button" data-act="rename">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
        Rename
      </button>
      <button class="attach-item" type="button" data-act="delete" style="color:var(--danger)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete
      </button>`;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    let top = r.bottom + 6, left = r.left;
    if (left + 180 > window.innerWidth) left = window.innerWidth - 190;
    if (top + 120 > window.innerHeight) top = r.top - 120;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    menu.querySelector('[data-act="rename"]').addEventListener('click', () => {
      menu.remove();
      const next = prompt('Rename conversation:', conv?.title || '');
      if (next != null && next.trim()) renameConversation(id, next.trim());
    });
    menu.querySelector('[data-act="delete"]').addEventListener('click', () => {
      menu.remove();
      if (confirm('Delete this conversation?')) deleteConversation(id);
    });
  }

  // ---------- EVENT BINDINGS ----------
  function bindEvents() {
    // Composer form submit
    dom.composer.addEventListener('submit', handleSubmit);

    async function handleSubmit(event) {
      event.preventDefault();
      event.stopPropagation();
      if (state.isGenerating) {
        state.abortController?.abort();
        return;
      }
      const text = dom.composerInput.value.trim();
      if (!text && state.attachments.length === 0) return;
      await sendMessage();
    }

    // Send button direct click (belt-and-braces)
    dom.sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleSubmit(e);
    });

    // Input events
    dom.composerInput.addEventListener('input', () => {
      autoResize();
      updateComposerState();
    });
    dom.composerInput.addEventListener('compositionstart', () => { state.composing = true; });
    dom.composerInput.addEventListener('compositionend', () => { state.composing = false; });
    dom.composerInput.addEventListener('keydown', (e) => {
      if (state.composing || e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey && state.settings.enterToSend) {
        e.preventDefault();
        dom.composer.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    // Sidebar
    dom.menuBtn.addEventListener('click', openSidebar);
    dom.sidebarClose.addEventListener('click', closeSidebar);
    dom.menuBackdrop.addEventListener('click', closeSidebar);
    dom.newChatBtn.addEventListener('click', startNewChat);
    dom.headerNewChat.addEventListener('click', startNewChat);

    dom.searchInput.addEventListener('input', debounce((e) => {
      const v = e.target.value;
      dom.searchClear.hidden = !v;
      renderHistory(v);
    }, 150));
    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClear.hidden = true;
      renderHistory('');
      dom.searchInput.focus();
    });

    dom.chatHistory.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.hi-menu');
      if (menuBtn) { e.stopPropagation(); openHistoryMenu(menuBtn, menuBtn.dataset.menu); return; }
      const item = e.target.closest('.hist-item');
      if (item) switchTo(item.dataset.id);
    });
    dom.chatHistory.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.hist-item');
      if (item) { e.preventDefault(); switchTo(item.dataset.id); }
    });

    // Settings / theme / clear
    dom.settingsBtn.addEventListener('click', openSettings);
    dom.settingsClose.addEventListener('click', closeSettings);
    dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === dom.settingsModal) closeSettings();
    });
    dom.themeBtn.addEventListener('click', () => {
      const next = state.settings.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveSettings();
      toast(`Theme: ${next}`, 'success');
    });
    dom.clearAllBtn.addEventListener('click', () => {
      if (!state.conversations.length) { toast('No conversations to clear', 'info'); return; }
      if (confirm('Delete all conversations? This cannot be undone.')) {
        state.conversations = [];
        state.currentId = null;
        saveChats(); saveCurrent();
        createConversation();
        renderHistory(); renderMessages();
        toast('All conversations cleared', 'success');
      }
    });

    // Model menu
    dom.modelBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dom.modelMenu.classList.toggle('open');
      dom.modelBadge.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.model-item').forEach(it => it.addEventListener('click', () => setModel(it.dataset.model)));

    // Attach
    dom.attachBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dom.attachMenu.classList.toggle('open');
      dom.attachBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.attach-item').forEach(it => it.addEventListener('click', () => {
      dom.attachMenu.classList.remove('open');
      dom.attachBtn.setAttribute('aria-expanded', 'false');
      if (it.dataset.kind === 'image') dom.imageInput.click();
      else dom.fileInput.click();
    }));
    dom.imageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) await addAttachmentsAndPreview(files);
      e.target.value = '';
    });
    dom.fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) await addAttachmentsAndPreview(files);
      e.target.value = '';
    });

    dom.attachments.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove]');
      if (!rm) return;
      state.attachments = state.attachments.filter(a => a.id !== rm.dataset.remove);
      renderAttachments();
      updateComposerState();
    });

    // Mic
    dom.micBtn.addEventListener('click', toggleRecording);
    dom.recordingCancel.addEventListener('click', cancelRecording);
    dom.recordingSend.addEventListener('click', sendRecording);

    // Message actions (delegated)
    dom.messages.addEventListener('click', async (e) => {
      const codeBtn = e.target.closest('.code-copy');
      if (codeBtn) {
        const el = document.getElementById(codeBtn.dataset.codeId);
        if (el) {
          try {
            await navigator.clipboard.writeText(el.textContent);
            codeBtn.classList.add('copied');
            const orig = codeBtn.innerHTML;
            codeBtn.innerHTML = '✓ Copied';
            setTimeout(() => { codeBtn.classList.remove('copied'); codeBtn.innerHTML = orig; }, 1200);
          } catch { toast('Copy failed', 'error'); }
        }
        return;
      }

      const lb = e.target.closest('[data-lightbox]');
      if (lb) { openLightbox(lb.dataset.lightbox); return; }

      const retry = e.target.closest('[data-retry]');
      if (retry) { regenerateFrom(+retry.dataset.retry); return; }

      const act = e.target.closest('.msg-action');
      if (!act) return;
      const idx = +act.dataset.idx;
      const conv = getCurrent();
      if (!conv) return;
      const m = conv.messages[idx];
      if (!m) return;

      if (act.dataset.action === 'copy') {
        try { await navigator.clipboard.writeText(m.content || ''); toast('Copied to clipboard', 'success'); }
        catch { toast('Copy failed', 'error'); }
      } else if (act.dataset.action === 'speak') {
        speak(m.content || '');
      } else if (act.dataset.action === 'regenerate') {
        regenerateFrom(idx);
      } else if (act.dataset.action === 'resend') {
        dom.composerInput.value = m.content || '';
        autoResize(); updateComposerState(); dom.composerInput.focus();
      }
    });

    // Lightbox
    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightbox.addEventListener('click', (e) => {
      if (e.target === dom.lightbox) closeLightbox();
    });

    // Settings controls
    $$('#themeSegmented button').forEach(b => b.addEventListener('click', () => {
      applyTheme(b.dataset.value);
      saveSettings();
    }));
    dom.switchEnter.addEventListener('click', () => toggleSwitch(dom.switchEnter, 'enterToSend'));
    dom.switchVoiceMode.addEventListener('click', () => toggleSwitch(dom.switchVoiceMode, 'voiceMode'));
    [dom.switchEnter, dom.switchVoiceMode].forEach(el => el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
    }));
    dom.clearFromSettings.addEventListener('click', () => {
      if (!state.conversations.length) { toast('No conversations to clear', 'info'); return; }
      if (confirm('Delete all conversations?')) {
        state.conversations = []; state.currentId = null;
        saveChats(); saveCurrent(); createConversation();
        renderHistory(); renderMessages();
        closeSettings();
        toast('Cleared', 'success');
      }
    });

    // Outside clicks
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#modelBadge') && !e.target.closest('#modelMenu')) {
        dom.modelMenu.classList.remove('open');
        dom.modelBadge.setAttribute('aria-expanded', 'false');
      }
      if (!e.target.closest('#attachBtn') && !e.target.closest('#attachMenu')) {
        dom.attachMenu.classList.remove('open');
        dom.attachBtn.setAttribute('aria-expanded', 'false');
      }
      const ctx = document.getElementById('ctxMenu');
      if (ctx && !e.target.closest('#ctxMenu')) ctx.remove();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSidebar();
        closeSettings();
        closeLightbox();
        dom.modelMenu.classList.remove('open');
        dom.attachMenu.classList.remove('open');
        document.getElementById('ctxMenu')?.remove();
        stopSpeaking();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewChat();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        openSidebar();
        dom.searchInput.focus();
      }
    });

    // Suggestions
    $$('.sugg').forEach(s => {
      s.addEventListener('click', () => {
        dom.composerInput.value = s.dataset.prompt || '';
        autoResize(); updateComposerState();
        dom.composerInput.focus();
      });
    });

    // System + network
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (state.settings.theme === 'system') applyTheme('system');
    });
    window.addEventListener('online', () => setStatus(true));
    window.addEventListener('offline', () => setStatus(false));

    // Reset mobile sidebar state on resize to desktop
    window.addEventListener('resize', debounce(() => {
      if (window.innerWidth > 860) {
        closeSidebar();
      }
    }, 150));
  }

  function setStatus(online) {
    dom.statusPill.classList.toggle('offline', !online);
    dom.statusPill.querySelector('.status-text').textContent = online ? 'Online' : 'Offline';
  }

  function toggleSwitch(el, key) {
    const on = el.classList.toggle('on');
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    state.settings[key] = on;
    saveSettings();
    if (key === 'voiceMode' && !on) stopSpeaking();
  }

  // ---------- INIT ----------
  function init() {
    load();
    applyTheme(state.settings.theme);

    dom.switchEnter.classList.toggle('on', state.settings.enterToSend);
    dom.switchEnter.setAttribute('aria-checked', String(state.settings.enterToSend));
    dom.switchVoiceMode.classList.toggle('on', state.settings.voiceMode);
    dom.switchVoiceMode.setAttribute('aria-checked', String(state.settings.voiceMode));

    if (!state.conversations.length) {
      createConversation();
    } else if (!state.currentId || !state.conversations.find(c => c.id === state.currentId)) {
      state.currentId = state.conversations[0].id;
      saveCurrent();
    }

    setModel(state.model);
    renderHistory();
    renderMessages();
    bindEvents();
    autoResize();
    updateComposerState();

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    setStatus(navigator.onLine);
    setTimeout(() => toast('Welcome to AURA AI ✦', 'success'), 400);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
