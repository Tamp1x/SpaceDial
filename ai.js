// AI Chat — Stage 5: tool calling, web search, state management

/* ─── Encryption ──────────────────────────────── */
const AI_STORAGE_KEY = 'spacedial-ai-key';
const AI_ENC_KEY = 'spacedial-enc-key';

async function getEncryptionKey() {
  let raw = (await chrome.storage.local.get(AI_ENC_KEY))[AI_ENC_KEY];
  if (!raw) {
    const key = await crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
    raw = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
    await chrome.storage.local.set({ [AI_ENC_KEY]: raw });
    return key;
  }
  return crypto.subtle.importKey('raw', new Uint8Array(raw), { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
async function encryptApiKey(plaintext) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...new Uint8Array(enc)));
}
async function decryptApiKey(packet) {
  try {
    const [ivB64, dataB64] = packet.split('.');
    const key = await getEncryptionKey();
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
    const dec = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch { return null; }
}
async function saveAiApiKey(plaintext) {
  if (!plaintext) { await chrome.storage.local.remove(AI_STORAGE_KEY); return; }
  const enc = await encryptApiKey(plaintext);
  await chrome.storage.local.set({ [AI_STORAGE_KEY]: enc });
}
async function loadAiApiKey() {
  const data = (await chrome.storage.local.get(AI_STORAGE_KEY))[AI_STORAGE_KEY];
  return data ? decryptApiKey(data) : null;
}

/* ─── Model data ──────────────────────────────── */
const MODELS = [
  { id:'gpt-5.5',name:'GPT 5.5',family:'GPT',vision:true},{ id:'gpt-5.5-pro',name:'GPT 5.5 Pro',family:'GPT',vision:true},
  { id:'gpt-5.4',name:'GPT 5.4',family:'GPT',vision:true},{ id:'gpt-5.4-pro',name:'GPT 5.4 Pro',family:'GPT',vision:true},
  { id:'gpt-5.4-mini',name:'GPT 5.4 Mini',family:'GPT',vision:true},{ id:'gpt-5.4-nano',name:'GPT 5.4 Nano',family:'GPT',vision:true},
  { id:'gpt-5.3-codex',name:'GPT 5.3 Codex',family:'GPT',vision:true},{ id:'gpt-5.3-codex-spark',name:'GPT 5.3 Codex Spark',family:'GPT',vision:true},
  { id:'gpt-5.2',name:'GPT 5.2',family:'GPT',vision:true},{ id:'gpt-5.2-codex',name:'GPT 5.2 Codex',family:'GPT',vision:true},
  { id:'gpt-5.1',name:'GPT 5.1',family:'GPT',vision:true},{ id:'gpt-5.1-codex',name:'GPT 5.1 Codex',family:'GPT',vision:true},
  { id:'gpt-5.1-codex-max',name:'GPT 5.1 Codex Max',family:'GPT',vision:true},{ id:'gpt-5.1-codex-mini',name:'GPT 5.1 Codex Mini',family:'GPT',vision:true},
  { id:'gpt-5',name:'GPT 5',family:'GPT',vision:true},{ id:'gpt-5-codex',name:'GPT 5 Codex',family:'GPT',vision:true},{ id:'gpt-5-nano',name:'GPT 5 Nano',family:'GPT',vision:true},
  { id:'claude-fable-5',name:'Claude Fable 5',family:'Claude',vision:true},{ id:'claude-opus-4-8',name:'Claude Opus 4.8',family:'Claude',vision:true},
  { id:'claude-opus-4-7',name:'Claude Opus 4.7',family:'Claude',vision:true},{ id:'claude-opus-4-6',name:'Claude Opus 4.6',family:'Claude',vision:true},
  { id:'claude-opus-4-5',name:'Claude Opus 4.5',family:'Claude',vision:true},{ id:'claude-opus-4-1',name:'Claude Opus 4.1',family:'Claude',vision:true},
  { id:'claude-sonnet-4-6',name:'Claude Sonnet 4.6',family:'Claude',vision:true},{ id:'claude-sonnet-4-5',name:'Claude Sonnet 4.5',family:'Claude',vision:true},
  { id:'claude-sonnet-4',name:'Claude Sonnet 4',family:'Claude',vision:true},{ id:'claude-haiku-4-5',name:'Claude Haiku 4.5',family:'Claude',vision:true},
  { id:'gemini-3.5-flash',name:'Gemini 3.5 Flash',family:'Gemini',vision:true},{ id:'gemini-3.1-pro',name:'Gemini 3.1 Pro',family:'Gemini',vision:true},{ id:'gemini-3-flash',name:'Gemini 3 Flash',family:'Gemini',vision:true},
  { id:'deepseek-v4-pro',name:'DeepSeek V4 Pro',family:'DeepSeek',vision:false},{ id:'deepseek-v4-flash',name:'DeepSeek V4 Flash',family:'DeepSeek',vision:false},{ id:'deepseek-v4-flash-free',name:'DeepSeek V4 Flash Free',family:'DeepSeek',vision:false,free:true},
  { id:'glm-5.2',name:'GLM 5.2',family:'GLM',vision:false},{ id:'glm-5.1',name:'GLM 5.1',family:'GLM',vision:false},{ id:'glm-5',name:'GLM 5',family:'GLM',vision:false},
  { id:'minimax-m2.7',name:'MiniMax M2.7',family:'MiniMax',vision:false},{ id:'minimax-m2.5',name:'MiniMax M2.5',family:'MiniMax',vision:false},{ id:'minimax-m3-free',name:'MiniMax M3 Free',family:'MiniMax',vision:false,free:true},
  { id:'kimi-k2.6',name:'Kimi K2.6',family:'Kimi',vision:true},{ id:'kimi-k2.5',name:'Kimi K2.5',family:'Kimi',vision:true},
  { id:'qwen3.6-plus',name:'Qwen 3.6 Plus',family:'Qwen',vision:false},{ id:'qwen3.5-plus',name:'Qwen 3.5 Plus',family:'Qwen',vision:false},{ id:'qwen3.6-plus-free',name:'Qwen 3.6 Plus Free',family:'Qwen',vision:false,free:true},
  { id:'grok-build-0.1',name:'Grok Build 0.1',family:'Grok',vision:false},
  { id:'big-pickle',name:'Big Pickle',family:'Other',vision:true,free:true},{ id:'mimo-v2.5-free',name:'MiMo V2.5 Free',family:'Other',vision:true,free:true},
  { id:'nemotron-3-ultra-free',name:'Nemotron 3 Ultra Free',family:'Other',vision:false,free:true},{ id:'north-mini-code-free',name:'North Mini Code Free',family:'Other',vision:false,free:true}
];

/* ─── State ───────────────────────────────────── */
let chats = [{ id:'default', name:'Chat 1', messages:[] }];
let activeChatId = 'default';
let viewingChatId = null;
let sidebarOpen = false;
let selectedModel = null;
let attachedFiles = [];
let visibleModels = null;

function saveChats() { try { localStorage.setItem('ai-chats', JSON.stringify(chats)); } catch {} }
function loadChats() { try { const d = JSON.parse(localStorage.getItem('ai-chats')); if (d && d.length) { chats = d; activeChatId = chats[0].id; } } catch {} }
loadChats();
removeEmptyChats();
saveChats();
const savedModel = localStorage.getItem('ai-model');
if (savedModel && MODELS.find(m => m.id === savedModel)) selectedModel = savedModel;
try { const vm = JSON.parse(localStorage.getItem('ai-visible-models')); if (Array.isArray(vm)) visibleModels = vm; } catch {}
function getFilteredModels() { return visibleModels ? MODELS.filter(m => visibleModels.includes(m.id)) : MODELS; }

/* ─── Model dropdown ──────────────────────────── */
function openModelDropdown() {
  document.getElementById('ai-model-dropdown').style.display = 'flex';
  document.getElementById('ai-model-selector').classList.add('open');
  renderModelList('');
  setTimeout(() => document.getElementById('ai-model-search')?.focus(), 50);
}
function closeModelDropdown() {
  document.getElementById('ai-model-dropdown').style.display = 'none';
  document.getElementById('ai-model-selector').classList.remove('open');
}
function toggleModelDropdown() {
  const dd = document.getElementById('ai-model-dropdown');
  if (dd.style.display === 'flex') closeModelDropdown(); else openModelDropdown();
}
function renderModelList(filter) {
  const list = document.getElementById('ai-model-list');
  list.innerHTML = '';
  const families = {};
  getFilteredModels().forEach(m => {
    const fn = m.family;
    if (!families[fn]) families[fn] = [];
    if (!filter || m.id.includes(filter) || m.name.toLowerCase().includes(filter) || fn.toLowerCase().includes(filter)) families[fn].push(m);
  });
  Object.keys(families).forEach(fn => {
    const group = families[fn];
    if (!group.length) return;
    const label = document.createElement('div');
    label.className = 'ai-model-group-label';
    label.textContent = fn;
    list.appendChild(label);
    group.forEach(m => {
      const el = document.createElement('div');
      el.className = 'ai-model-item' + (selectedModel === m.id ? ' selected' : '');
      el.innerHTML = `<span class="ai-model-cap ${m.vision?'v':'t'}">${m.vision?'🖼':'T'}</span><span class="ai-model-name"><span class="h">${m.name}</span>${m.free?' <span style="color:rgba(100,255,130,0.4);font-size:11px">free</span>':''}</span>`;
      el.addEventListener('click', () => selectModel(m.id));
      list.appendChild(el);
    });
  });
}
function selectModel(id) {
  selectedModel = id;
  localStorage.setItem('ai-model', id);
  const m = MODELS.find(x => x.id === id);
  document.getElementById('ai-model-current').innerHTML = m ? `<span class="ai-model-cap ${m.vision?'v':'t'}" style="display:inline-flex;width:16px;height:16px;font-size:10px;margin-right:4px">${m.vision?'🖼':'T'}</span>${m.name}` : id;
  closeModelDropdown();
  renderModelList(document.getElementById('ai-model-search')?.value || '');
}

/* ─── Model visibility settings ──────────────── */
function openModelSettings() { document.getElementById('ai-model-settings-overlay').style.display = 'flex'; renderModelSettings(); }
function closeModelSettings() { document.getElementById('ai-model-settings-overlay').style.display = 'none'; }
function renderModelSettings() {
  const body = document.getElementById('ai-model-settings-body');
  body.innerHTML = '';
  MODELS.forEach(m => {
    const visible = !visibleModels || visibleModels.includes(m.id);
    const el = document.createElement('div');
    el.className = 'ai-ms-item';
    el.innerHTML = `<span class="ai-ms-toggle ${visible?'on':''}">${visible?'✓':''}</span><span class="ai-ms-name"><span class="ai-model-cap ${m.vision?'v':'t'}" style="display:inline-flex;width:16px;height:16px;font-size:10px;margin-right:6px">${m.vision?'🖼':'T'}</span>${m.name}</span>`;
    el.addEventListener('click', () => {
      if (!visibleModels) visibleModels = MODELS.map(x => x.id);
      if (visible) { visibleModels = visibleModels.filter(id => id !== m.id); if (visibleModels.length === MODELS.length) visibleModels = null; }
      else { if (visibleModels === null) visibleModels = MODELS.map(x => x.id); visibleModels.push(m.id); }
      localStorage.setItem('ai-visible-models', JSON.stringify(visibleModels));
      renderModelSettings();
      renderModelList(document.getElementById('ai-model-search')?.value || '');
    });
    body.appendChild(el);
  });
}

/* ─── Chat management ─────────────────────────── */
function renderChatList() {
  const list = document.getElementById('ai-chat-list');
  list.innerHTML = '';
  const active = chats.find(c => c.id === activeChatId);
  const others = chats.filter(c => c.id !== activeChatId);
  const appendChat = (c, isActive) => {
    const wrap = document.createElement('div');
    wrap.className = 'ai-chat-item-wrap';
    const el = document.createElement('div');
    const viewing = viewingChatId && viewingChatId === c.id;
    el.className = 'ai-chat-item' + (isActive ? ' active' : '');
    if (viewing && !isActive) el.style.background = 'rgba(255,255,255,0.03)';
    el.textContent = c.name + (viewing && !isActive ? ' ●' : '');
    el.addEventListener('click', () => switchChat(c.id));
    wrap.appendChild(el);
    const del = document.createElement('button');
    del.className = 'ai-chat-del';
    del.textContent = '✕';
    del.addEventListener('click', e => { e.stopPropagation(); deleteChat(c.id); });
    wrap.appendChild(del);
    list.appendChild(wrap);
  };
  if (active) appendChat(active, true);
  if (active && others.length) { const sep = document.createElement('div'); sep.className = 'ai-chat-sep'; list.appendChild(sep); }
  others.forEach(c => appendChat(c, false));
}
function switchChat(id) {
  if (id !== activeChatId) {
    const active = getActiveChat();
    if (active && active.messages.length === 0 && chats.length > 1) {
      chats = chats.filter(c => c.id !== active.id);
    }
  }
  viewingChatId = id; attachedFiles = []; renderAttachBar(); renderChatList(); renderMessages();
}
function deleteChat(id) {
  if (chats.length <= 1) return;
  chats = chats.filter(c => c.id !== id);
  if (activeChatId === id) activeChatId = chats[0].id;
  if (viewingChatId === id) viewingChatId = null;
  saveChats(); renderChatList(); renderMessages();
}
function createNewChat() {
  removeEmptyChats();
  const id = 'chat-' + Date.now();
  chats.unshift({ id, name:'New chat', messages:[] });
  activeChatId = id; viewingChatId = null; attachedFiles = [];
  renderAttachBar(); saveChats(); renderChatList(); renderMessages();
}
function removeEmptyChats() {
  const nonEmpty = chats.filter(c => c.messages.length > 0);
  if (nonEmpty.length === 0) return;
  chats = nonEmpty;
  if (!chats.find(c => c.id === activeChatId)) activeChatId = chats[0].id;
  if (viewingChatId && !chats.find(c => c.id === viewingChatId)) viewingChatId = null;
}
function getActiveChat() { return chats.find(c => c.id === activeChatId) || chats[0]; }
function getDisplayedChat() { const id = viewingChatId || activeChatId; return chats.find(c => c.id === id) || getActiveChat(); }
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function formatContent(text) {
  if (!text) return '';
  let html = '', lastIdx = 0;
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  const blocks = [];
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) blocks.push({ type:'text', text: text.slice(lastIdx, m.index) });
    blocks.push({ type:'code', lang: m[1] || '', code: m[2] });
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) blocks.push({ type:'text', text: text.slice(lastIdx) });
  for (const b of blocks) {
    if (b.type === 'text') {
      html += '<p style="margin:2px 0">' + escapeHtml(b.text).replace(/\n/g, '<br>') + '</p>';
    } else {
      const uid = 'cb-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
      html += '<div class="ai-code-block" data-uid="' + uid + '" data-lang="' + escapeHtml(b.lang) + '">';
      html += '<div class="ai-code-header"><span class="ai-code-lang">' + escapeHtml(b.lang || 'code') + '</span><button class="ai-code-copy" data-uid="' + uid + '">Copy</button></div>';
      html += '<pre class="ai-code-pre" id="' + uid + '">' + escapeHtml(b.code) + '</pre>';
      if (b.lang === 'html') {
        html += '<div class="ai-html-preview" data-uid="' + uid + '" style="display:none"><iframe sandbox="allow-scripts" style="width:100%;height:350px;border:none;background:transparent;border-radius:0 0 8px 8px"></iframe></div>';
        html += '<button class="ai-html-toggle" data-uid="' + uid + '" style="width:100%;background:transparent;border:none;border-top:1px solid rgba(255,255,255,0.06);color:rgba(100,180,255,0.6);cursor:pointer;font-size:12px;padding:6px;font-family:inherit">Preview</button>';
      }
      html += '</div>';
    }
  }
  return html;
}
function renderMessages() {
  const container = document.getElementById('ai-messages');
  const chat = getDisplayedChat();
  container.innerHTML = '';
  if (!chat.messages.length) {
    container.innerHTML = '<div class="ai-msg ai-welcome"><div class="ai-msg-bubble">How can I help you today? I can answer questions, work with files and images, search the web, and help you manage SpaceDial settings, dials, and folders.</div></div>';
    return;
  }
  chat.messages.forEach(m => {
    const el = document.createElement('div');
    el.className = 'ai-msg';
    el.style.justifyContent = m.role === 'user' ? 'flex-end' : 'flex-start';
    let fileHtml = '';
    if (m.files && m.files.length) {
      fileHtml = m.files.map(f => { if (f.type === 'image') return `<img src="${f.data}" style="max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:4px">`; return `<span style="font-size:12px;color:rgba(255,255,255,0.4)">📎 ${f.name}</span>`; }).join('');
    }
    const contentText = m.content || '';
    const formatted = m.role === 'user' ? fileHtml + escapeHtml(contentText).replace(/\n/g, '<br>') : fileHtml + formatContent(contentText);
    el.innerHTML = `<div class="ai-msg-bubble" style="${m.role === 'user' ? 'background:rgba(100,180,255,0.15);color:rgba(200,230,255,0.9)' : ''}">${formatted}</div>`;
    container.appendChild(el);
  });
  // Attach copy/preview handlers
  container.querySelectorAll('.ai-code-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const pre = document.getElementById(btn.dataset.uid);
      if (pre) { navigator.clipboard.writeText(pre.textContent); btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
    });
  });
  container.querySelectorAll('.ai-html-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const preview = document.querySelector('.ai-html-preview[data-uid="' + btn.dataset.uid + '"]');
      const pre = document.getElementById(btn.dataset.uid);
      if (!preview || !pre) return;
      if (preview.style.display === 'none') {
        const code = pre.textContent;
        const isFull = /<(DOCTYPE|html|head|body)\b/i.test(code);
        const wrapped = isFull ? code : '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;font-family:sans-serif">' + code + '</body></html>';
        preview.querySelector('iframe').srcdoc = wrapped;
        preview.style.display = 'block';
        btn.textContent = 'Code';
      } else {
        preview.style.display = 'none';
        btn.textContent = 'Preview';
      }
    });
  });
  container.scrollTop = container.scrollHeight;
}
function addMessage(role, content, files) { getActiveChat().messages.push({ role, content, files: files || [] }); saveChats(); renderMessages(); }

/* ─── File attachments ────────────────────────── */
function renderAttachBar() {
  const bar = document.getElementById('ai-attach-bar');
  bar.innerHTML = '';
  if (!attachedFiles.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  attachedFiles.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'ai-attach-chip' + (f.type === 'image' ? ' ai-attach-img' : '');
    if (f.type === 'image') { chip.innerHTML = `<img src="${f.data}"><span class="ai-attach-name">${f.name}</span>`; }
    else { chip.innerHTML = `<span class="ai-attach-name">📎 ${f.name}</span>`; }
    const rm = document.createElement('button');
    rm.className = 'ai-attach-remove';
    rm.textContent = '✕';
    rm.addEventListener('click', () => { attachedFiles.splice(i,1); renderAttachBar(); });
    chip.appendChild(rm);
    bar.appendChild(chip);
  });
}
function attachFile(file) {
  const reader = new FileReader();
  reader.onload = e => { attachedFiles.push({ name: file.name, type: file.type.startsWith('image/') ? 'image' : 'file', data: e.target.result, file }); renderAttachBar(); };
  if (file.type.startsWith('image/')) reader.readAsDataURL(file); else reader.readAsDataURL(file);
}

/* ─── API key ────────────────────────────────── */
let cachedApiKey = null;
async function ensureApiKey() {
  if (cachedApiKey) return cachedApiKey;
  cachedApiKey = await loadAiApiKey();
  if (cachedApiKey) return cachedApiKey;
  return new Promise(resolve => {
    const overlay = document.getElementById('ai-key-overlay');
    const input = document.getElementById('ai-key-input');
    const error = document.getElementById('ai-key-error');
    input.value = ''; error.style.display = 'none'; overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
    document.getElementById('ai-key-save').onclick = async () => {
      const key = input.value.trim();
      if (!key) { error.textContent = 'Please enter an API key.'; error.style.display = 'block'; return; }
      try { const r = await fetch('https://opencode.ai/zen/v1/models', { headers: { 'Authorization':'Bearer '+key } }); if (!r.ok) { error.textContent='Invalid key (HTTP '+r.status+')'; error.style.display='block'; return; } } catch(e) { error.textContent='Network error: '+e.message; error.style.display='block'; return; }
      await saveAiApiKey(key); cachedApiKey = key; overlay.style.display = 'none'; resolve(key);
    };
    input.onkeydown = e => { if (e.key === 'Enter') document.getElementById('ai-key-save').click(); };
  });
}

/* ─── Tool definitions ────────────────────────── */
const TOOLS = [
  { type:'function', function:{ name:'web_search', description:'Search the web for current information.', parameters:{ type:'object', properties:{ query:{ type:'string', description:'Search query' } }, required:['query'] } } },
  { type:'function', function:{ name:'get_dials', description:'Get list of all dials, folders, groups, and settings.', parameters:{ type:'object', properties:{} } } },
  { type:'function', function:{ name:'create_dial', description:'Create a new dial.', parameters:{ type:'object', properties:{ title:{ type:'string' }, url:{ type:'string' }, folderId:{ type:'string', description:'Optional folder ID' }, icon:{ type:'string', description:'Optional icon URL' } }, required:['title','url'] } } },
  { type:'function', function:{ name:'update_dial', description:'Update a dial.', parameters:{ type:'object', properties:{ id:{ type:'string' }, title:{ type:'string' }, url:{ type:'string' }, icon:{ type:'string' } }, required:['id'] } } },
  { type:'function', function:{ name:'delete_dial', description:'Delete a dial or folder.', parameters:{ type:'object', properties:{ id:{ type:'string' } }, required:['id'] } } },
  { type:'function', function:{ name:'create_folder', description:'Create a folder.', parameters:{ type:'object', properties:{ name:{ type:'string' } }, required:['name'] } } },
  { type:'function', function:{ name:'move_dial_to_folder', description:'Move a dial into/out of a folder.', parameters:{ type:'object', properties:{ dialId:{ type:'string' }, folderId:{ type:'string', description:'Folder ID, or "root" to move out' } }, required:['dialId','folderId'] } } },
  { type:'function', function:{ name:'change_setting', description:'Change a SpaceDial setting.', parameters:{ type:'object', properties:{ key:{ type:'string', description:'Setting name: cols, dialShape, showLabel, showFavicon, glass, showBorder, bgType, autoDayNight, weatherEffect, autoWeather, showClock, use24h, showWeather, showPlayer, showNotes, tempUnit, speedTestMode' }, value:{ description:'New value' } }, required:['key','value'] } } },
  { type:'function', function:{ name:'open_url', description:'Open a website in a new browser tab.', parameters:{ type:'object', properties:{ url:{ type:'string', description:'Full URL to open (e.g. https://youtube.com)' } }, required:['url'] } } }
];

function sGetGroup(s) { return (s.groups||[]).find(g => !g.isHome) || (s.groups||[])[0]; }
function sFindDial(s, id) {
  for (const g of (s.groups||[])) {
    for (let i = 0; i < (g.dials||[]).length; i++) {
      const d = g.dials[i];
      if (d.id === id) return { item:d, list:g.dials, idx:i, group:g };
      if (d.type === 'folder' && d.dials)
        for (let j = 0; j < d.dials.length; j++)
          if (d.dials[j].id === id) return { item:d.dials[j], list:d.dials, idx:j, parent:d, group:g };
    }
  }
  return null;
}
function sCollectDials(s) {
  const out = { folders:[], dials:0 };
  (s.groups||[]).forEach(g => (g.dials||[]).forEach(d => {
    if (d.type === 'folder') { out.folders.push(d); if (d.dials) d.dials.forEach(dd => { if (dd.type !== 'folder') out.dials++; }); }
    else out.dials++;
  }));
  return out;
}

async function executeToolCall(tc) {
  let args;
  try { args = JSON.parse(tc.args || '{}'); } catch { args = {}; }
  const name = tc.name;
  try {
    switch (name) {
      case 'web_search': {
        try {
          const html = await (await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`)).text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const results = [];
          doc.querySelectorAll('.result').forEach(el => {
            if (results.length >= 5) return;
            const link = el.querySelector('.result__a');
            const snippet = el.querySelector('.result__snippet');
            if (!link) return;
            let url = link.getAttribute('href') || '';
            const m = url.match(/uddg=([^&]+)/);
            if (m) url = decodeURIComponent(m[1]);
            const title = link.textContent.trim();
            const text = snippet ? snippet.textContent.trim() : '';
            if (title) results.push(title + ' — ' + text + '\n' + url);
          });
          if (results.length) return results.join('\n\n');
        } catch {}
        const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json`);
        const data = await r.json();
        let result = data.AbstractText || data.Answer || '';
        if (!result && data.RelatedTopics?.length) result = data.RelatedTopics.slice(0,5).map(t => t.Text || t.FirstURL).filter(Boolean).join('\n');
        if (!result && data.AbstractURL) result = data.AbstractURL;
        return result || 'No results for "' + args.query + '".';
      }
      case 'get_dials': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No SpaceDial state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const info = sCollectDials(s);
        return JSON.stringify({
          totalDials: info.dials, totalFolders: info.folders.length,
          folders: info.folders.map(f => ({ id:f.id, name:f.name, dialCount:(f.dials||[]).filter(x=>x.type!=='folder').length })),
          groups: (s.groups||[]).map(g => ({ id:g.id, name:g.name })),
          settings: s.settings ? { cols:s.settings.cols, dialShape:s.settings.dialShape, bgType:s.settings.bgType } : null
        }, null, 2);
      }
      case 'create_dial': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const g = sGetGroup(s);
        if (!g) return 'No group found.';
        const nd = { id:'d-'+Date.now(), name:args.title, url:args.url, type:'dial', favIconUrl:null, customIcon:null, iconScale:100 };
        if (args.icon) nd.customIcon = args.icon;
        if (args.folderId) {
          const f = (g.dials||[]).find(d => d.id===args.folderId && d.type==='folder');
          if (!f) return 'Folder not found.';
          if (!f.dials) f.dials = [];
          f.dials.push(nd);
        } else {
          if (!g.dials) g.dials = [];
          g.dials.push(nd);
        }
        await chrome.storage.local.set({ 'ds2': s });
        parent.postMessage({ type:'spacedial-state-changed' }, '*');
        return 'Dial "'+args.title+'" created in group "'+g.name+'".';
      }
      case 'update_dial': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const found = sFindDial(s, args.id);
        if (!found) return 'Not found.';
        const d = found.item;
        if (args.title!==undefined) d.name = args.title;
        if (args.url!==undefined) d.url = args.url;
        if (args.icon!==undefined) d.customIcon = args.icon;
        await chrome.storage.local.set({ 'ds2': s });
        parent.postMessage({ type:'spacedial-state-changed' }, '*');
        return 'Dial "'+(d.name||d.title)+'" updated.';
      }
      case 'delete_dial': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const found = sFindDial(s, args.id);
        if (!found) return 'Not found.';
        found.list.splice(found.idx, 1);
        await chrome.storage.local.set({ 'ds2': s });
        parent.postMessage({ type:'spacedial-state-changed' }, '*');
        return 'Deleted.';
      }
      case 'create_folder': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const g = sGetGroup(s);
        if (!g) return 'No group found.';
        const folder = { id:'f-'+Date.now(), type:'folder', name:args.name, customIcon:null, coverDialId:'', iconScale:100, dials:[] };
        if (!g.dials) g.dials = [];
        g.dials.push(folder);
        await chrome.storage.local.set({ 'ds2': s });
        parent.postMessage({ type:'spacedial-state-changed' }, '*');
        return 'Folder "'+args.name+'" created in group "'+g.name+'".';
      }
      case 'move_dial_to_folder': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const found = sFindDial(s, args.dialId);
        if (!found) return 'Dial not found.';
        const [dial] = found.list.splice(found.idx, 1);
        if (args.folderId === 'root') {
          (sGetGroup(s)||s.groups[0]).dials.push(dial);
        } else {
          const f = sFindDial(s, args.folderId);
          if (!f || f.item.type !== 'folder') return 'Folder not found.';
          if (!f.item.dials) f.item.dials = [];
          f.item.dials.push(dial);
        }
        await chrome.storage.local.set({ 'ds2': s });
        parent.postMessage({ type:'spacedial-state-changed' }, '*');
        return 'Dial moved.';
      }
      case 'change_setting': {
        const raw = (await chrome.storage.local.get('ds2'))['ds2'];
        if (!raw) return 'No state found.';
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!s.settings) s.settings = {};
        const v = args.value;
        if (v==='true') s.settings[args.key]=true; else if (v==='false') s.settings[args.key]=false; else if (!isNaN(Number(v))) s.settings[args.key]=Number(v); else s.settings[args.key]=v;
        await chrome.storage.local.set({ 'ds2': s });
        parent.postMessage({ type:'spacedial-state-changed' }, '*');
        return 'Setting "'+args.key+'" changed to '+JSON.stringify(s.settings[args.key])+'.';
      }
      case 'open_url': {
        const url = args.url && !/^https?:\/\//i.test(args.url) ? 'https://'+args.url : args.url;
        if (url) chrome.tabs.create({ url, active: true });
        return 'Opened: '+(url||'?');
      }
      default: return 'Unknown tool: '+name;
    }
  } catch(e) { return 'Error: '+e.message; }
}

/* ─── Tool confirmation ────────────────────────── */
const DESTRUCTIVE_TOOLS = ['create_dial','update_dial','delete_dial','create_folder','move_dial_to_folder','change_setting'];
function requestToolConfirmation(tcList) {
  if (!tcList.some(tc => DESTRUCTIVE_TOOLS.includes(tc.name))) return Promise.resolve(true);
  return new Promise(resolve => {
    const overlay = document.getElementById('ai-confirm-overlay');
    const body = document.getElementById('ai-confirm-body');
    body.innerHTML = '<div style="margin-bottom:8px;color:rgba(255,255,255,0.45)">The AI wants to:</div>';
    const safeParse = s => { try { return JSON.parse(s||'{}'); } catch { return {}; } };
    tcList.forEach(tc => {
      const a = safeParse(tc.args);
      const labels = {
        create_dial: 'Create dial: ' + (a.title||'?'),
        update_dial: 'Update dial: ' + (a.id||'?'),
        delete_dial: 'Delete dial/folder: ' + (a.id||'?'),
        create_folder: 'Create folder: ' + (a.name||'?'),
        move_dial_to_folder: 'Move dial: ' + (a.dialId||'?') + ' → ' + (a.folderId||'root'),
        change_setting: 'Change setting: ' + (a.key||'?') + ' = ' + JSON.stringify(a.value),
        open_url: 'Open website: ' + (a.url||'?'),
        web_search: 'Search web: ' + (a.query||'?'),
        get_dials: 'List dials'
      };
      const el = document.createElement('div');
      el.className = 'ai-confirm-tool';
      el.innerHTML = '<div class="ai-confirm-tool-name">' + (labels[tc.name] || tc.name) + '</div>';
      body.appendChild(el);
    });
    overlay.style.display = 'flex';
    const cleanup = () => { overlay.style.display = 'none'; document.getElementById('ai-confirm-allow').onclick = null; document.getElementById('ai-confirm-deny').onclick = null; };
    document.getElementById('ai-confirm-allow').onclick = () => { cleanup(); resolve(true); };
    document.getElementById('ai-confirm-deny').onclick = () => { cleanup(); resolve(false); };
  });
}

/* ─── API integration ─────────────────────────── */
const SYSTEM_PROMPT = 'You are a helpful AI assistant integrated into SpaceDial — a Chrome new tab page extension. You can answer questions, work with files/images, search the web, and manage the user\'s SpaceDial experience. Available tools: web_search (search the web), get_dials (list all dials/folders), create_dial, update_dial, delete_dial, create_folder, move_dial_to_folder, change_setting. When the user asks about their dials or settings, call get_dials first. Be concise and friendly. Do not ask the user for confirmation before executing tool calls — just do what they ask and report the result.';

function buildApiMessages(chat) {
  const msgs = [{ role:'system', content:SYSTEM_PROMPT }];
  chat.messages.forEach(m => {
    if (m.role === 'system') return;
    let content;
    if (m.files && m.files.length && m.files.some(f => f.type === 'image')) {
      content = [{ type:'text', text:m.content || '' }];
      m.files.filter(f => f.type === 'image').forEach(f => content.push({ type:'image_url', image_url:{ url:f.data } }));
    } else content = m.content || '';
    msgs.push({ role:m.role, content });
  });
  return msgs;
}

async function sendToAPI(key, chat, skipTools = false) {
  let messages = buildApiMessages(chat);
  const model = selectedModel || 'gpt-5-nano';
  let finalContent = '';

  for (let turn = 0; turn < 10; turn++) {
    const body = { model, messages, stream: true, max_tokens: 4096 };
    if (!skipTools) { body.tools = TOOLS; body.tool_choice = 'auto'; }
    const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+key }, body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.text();
      if (!skipTools && (res.status === 400 || /tool|function/i.test(err))) {
        return sendToAPI(key, chat, true);
      }
      throw new Error('API error '+res.status+': '+err.slice(0,200));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', content = '', toolCalls = {};
    let isFirstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const p = JSON.parse(data);
          const delta = p.choices?.[0]?.delta || {};
          const finish = p.choices?.[0]?.finish_reason;

          if (delta.content) {
            content += delta.content;
            if (isFirstChunk) {
              isFirstChunk = false;
              hideThinking();
              const container = document.getElementById('ai-messages');
              const bubble = document.createElement('div');
              bubble.className = 'ai-msg-bubble';
              const el = document.createElement('div');
              el.className = 'ai-msg';
              el.style.justifyContent = 'flex-start';
              el.appendChild(bubble);
              container.appendChild(el);
              bubble.textContent = content;
              container.scrollTop = container.scrollHeight;
            } else {
              const bubbles = document.querySelectorAll('#ai-messages > .ai-msg:last-child .ai-msg-bubble');
              if (bubbles.length) { bubbles[bubbles.length-1].textContent = content; document.getElementById('ai-messages').scrollTop = document.getElementById('ai-messages').scrollHeight; }
            }
          }

          if (delta.tool_calls) {
            if (isFirstChunk) { isFirstChunk = false; hideThinking(); }
            for (const tc of delta.tool_calls) {
              if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, name: tc.function?.name || '', args: tc.function?.arguments || '' };
              else {
                if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].args += tc.function.arguments;
                if (tc.id) toolCalls[tc.index].id = tc.id;
              }
            }
          }

          if (finish === 'tool_calls' || finish === 'stop') {
            // Collect remaining buffer
          }
        } catch {}
      }
    }

    const tcList = Object.values(toolCalls).filter(tc => tc.name);

    if (tcList.length) {
      messages.push({ role:'assistant', content:content || null, tool_calls: tcList.map(tc => ({ id:tc.id, type:'function', function:{ name:tc.name, arguments:tc.args } })) });
      const confirmed = await requestToolConfirmation(tcList);
      if (!confirmed) { finalContent = content || 'Action cancelled.'; break; }
      let allErrored = true;
      for (const tc of tcList) {
        const result = await executeToolCall(tc);
        messages.push({ role:'tool', tool_call_id: tc.id, content: result });
        if (!result.startsWith('Error:')) allErrored = false;
      }
      if (allErrored) { finalContent = content || 'Tool calls failed. Please try again.'; break; }
    } else {
      finalContent = content;
      break;
    }
  }
  return finalContent;
}

/* ─── Thinking indicator ───────────────────────── */
const FUNNY_PHRASES = [
  'Сжигаем оперативку...','Пьем воду, остужаем сервер...',
  'Выгоняем кота с клавиатуры...','Сдуваем пыль с транзисторов...',
  'Ищем потерянный бит информации под диваном...','Делаем умный вид...',
  'Пытаемся понять ТЗ с первого раза...','Спорим в чате, чей алгоритм лучше...',
  'Перепроверяем, не восстали ли машины (пока всё ок)...',
  'Ждем, пока у разработчика доварится кофе...','Синхронизируем биополя процессоров...',
  'Переворачиваем пиксели нужной стороной...','Калибруем внутренний компас логики...',
  'Разгоняем электроны вручную...','Консультируемся с кофейной гущей по API...'
];
let funnyThinking = false;
chrome.storage.local.get('ai-funny-thinking', r => { funnyThinking = !!r['ai-funny-thinking']; });
function showThinking() {
  hideThinking();
  const text = funnyThinking ? FUNNY_PHRASES[Math.floor(Math.random()*FUNNY_PHRASES.length)] : 'Thinking';
  const container = document.getElementById('ai-messages');
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg';
  wrap.id = 'ai-thinking';
  wrap.style.justifyContent = 'flex-start';
  wrap.innerHTML = '<div class="ai-msg-bubble ai-thinking-bubble">' + text + '<div class="ai-thinking-dots"><span></span><span></span><span></span></div></div>';
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}
function hideThinking() { const el = document.getElementById('ai-thinking'); if (el) el.remove(); }

/* ─── Send ────────────────────────────────────── */
async function sendMessage() {
  const input = document.getElementById('ai-input');
  const text = input.value.trim();
  if (!text && !attachedFiles.length) return;
  if (viewingChatId && viewingChatId !== activeChatId) { activeChatId = viewingChatId; renderChatList(); }
  const key = await ensureApiKey();
  if (!key) return;
  const files = attachedFiles.slice();
  addMessage('user', text, files);
  viewingChatId = null;
  attachedFiles = []; renderAttachBar();
  input.value = ''; input.style.height = 'auto';
  showThinking();
  const chat = getActiveChat();
  try {
    const reply = await sendToAPI(key, chat);
    hideThinking();
    if (reply) {
      addMessage('assistant', reply);
      const active = getActiveChat();
      if (active.name === 'New chat') {
        active.name = reply.replace(/\n/g, ' ').trim().slice(0, 40) + (reply.length > 40 ? '...' : '');
        saveChats(); renderChatList();
      }
    }
  } catch (e) {
    hideThinking();
    addMessage('assistant', '⚠️ Error: ' + e.message);
    if (e.message.includes('401') || e.message.includes('403') || e.message.includes('auth')) cachedApiKey = null;
  }
}

/* ─── URL param: ?new ─────────────────────────── */
if (location.search.includes('new')) createNewChat();

/* ─── Theme + glass finish from SpaceDial ─────── */
(function applyThemeFromParams() {
  function apply(theme, glass, liquidVariant) {
    document.documentElement.dataset.glass = glass;
    document.body.dataset.theme = theme;
    document.body.dataset.liquidVariant = theme === 'liquid' ? (liquidVariant || 'light') : '';
  }
  const params = new URLSearchParams(location.search);
  const qTheme = params.get('theme');
  const qGlass = params.get('glass');
  const qLv = params.get('liquidVariant');
  if (qTheme || qGlass) { apply(qTheme || 'default', qGlass || 'none', qLv || 'light'); return; }
  chrome.storage.local.get('ds2', (r) => {
    let theme = 'default', glass = 'none', liquidVariant = 'light';
    try {
      const raw = r.ds2;
      if (raw) {
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (s.settings) theme = s.settings.theme || 'default';
        if (s.settings) liquidVariant = s.settings.liquidVariant || 'light';
        if (s.settings?.glass) glass = s.settings.glassStyle || 'standard';
      }
    } catch {}
    apply(theme, glass, liquidVariant);
  });
})();

/* ─── Init ────────────────────────────────────── */
document.getElementById('ai-model-selector').addEventListener('click', toggleModelDropdown);
document.addEventListener('click', e => { if (!e.target.closest('#ai-model-selector') && !e.target.closest('#ai-model-dropdown')) closeModelDropdown(); });
document.getElementById('ai-model-search').addEventListener('input', function() { renderModelList(this.value.toLowerCase()); });
document.getElementById('ai-sidebar-toggle').addEventListener('click', () => { sidebarOpen = !sidebarOpen; document.getElementById('ai-root').classList.toggle('sidebar-open', sidebarOpen); });
document.getElementById('ai-new-chat-btn').addEventListener('click', createNewChat);
document.getElementById('ai-send-btn').addEventListener('click', sendMessage);
document.getElementById('ai-model-settings-btn').addEventListener('click', openModelSettings);
document.getElementById('ai-model-settings-close').addEventListener('click', closeModelSettings);
document.getElementById('ai-model-settings-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModelSettings(); });
document.getElementById('ai-input').addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
document.getElementById('ai-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
document.getElementById('ai-attach-btn').addEventListener('click', () => { document.getElementById('ai-file-input').click(); });
document.getElementById('ai-file-input').addEventListener('change', e => { Array.from(e.target.files).forEach(f => attachFile(f)); e.target.value = ''; });
const main = document.getElementById('ai-main');
main.addEventListener('dragover', e => { e.preventDefault(); main.classList.add('drag-over'); });
main.addEventListener('dragleave', e => { main.classList.remove('drag-over'); });
main.addEventListener('drop', e => { e.preventDefault(); main.classList.remove('drag-over'); Array.from(e.dataTransfer.files).forEach(f => attachFile(f)); });
document.getElementById('ai-input').addEventListener('paste', e => { const items = e.clipboardData.items; for (const item of items) { if (item.type.startsWith('image/')) { e.preventDefault(); const file = item.getAsFile(); if (file) attachFile(file); break; } } });
if (selectedModel) { const m = MODELS.find(x => x.id === selectedModel); document.getElementById('ai-model-current').innerHTML = m ? `<span class="ai-model-cap ${m.vision?'v':'t'}" style="display:inline-flex;width:16px;height:16px;font-size:10px;margin-right:4px">${m.vision?'🖼':'T'}</span>${m.name}` : selectedModel; }
renderChatList();
renderMessages();
