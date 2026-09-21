const UI_HOST_ID = 'ytsae-root';
const CONTROL_BUTTON_CLASS = 'ytsae-control-btn';
const PAGE_STYLES_ID = 'ytsae-page-styles';
const MAX_CONTEXT_PHRASES = 2;
const PHRASE_MATCH_TOLERANCE_SEC = 0.3;
const MAX_PHRASE_LENGTH = 300;
const FETCH_TIMEOUT_MS = 20000;
const CAPTION_CAPTURE_TIMEOUT_MS = 6000;
const CAPTURED_LIMIT = 6;
const ASR_SENTENCE_GAP_SEC = 1.5;

const CONTROL_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px;display:block;pointer-events:none;">
  <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
</svg>`;

const state = {
  videoId: null,
  phrases: null,
  loadingPromise: null,
  loadingVideoId: null,
  capturedCaptions: [],
  capturedKeys: new Set(),
  host: null,
  backdrop: null,
  phraseEl: null,
  modalBody: null,
  modalOpen: false,
  requestSeq: 0,
  controlButton: null,
  phraseSaveButton: null,
  lastResult: null,
  currentContext: null,
};

const SHELL_HTML = `
<style>
  .ytsae-backdrop {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, .45);
    backdrop-filter: blur(3px);
    pointer-events: auto;
    font: 400 14px/1.55 Roboto, Arial, sans-serif;
    color: #f1f1f1;
  }
  .ytsae-backdrop[hidden] { display: none; }
  .ytsae-modal {
    display: flex;
    flex-direction: column;
    width: min(680px, 92%);
    max-height: 72%;
    position: relative;
    background: #181818;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, .6);
    overflow: hidden;
    animation: ytsae-pop .16s ease;
  }
  @keyframes ytsae-pop {
    from { opacity: 0; transform: translateY(10px) scale(.98); }
    to { opacity: 1; transform: none; }
  }
  .ytsae-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, .08);
  }
  .ytsae-head h3 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; }
  .ytsae-save-phrase {
    background: rgba(255, 255, 255, .08);
    border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 999px;
    color: #d5d5d5;
    font-size: 12px;
    line-height: 1;
    padding: 6px 10px;
    cursor: pointer;
  }
  .ytsae-save-phrase:hover { color: #ffd54f; border-color: rgba(255, 213, 79, .5); }
  .ytsae-save-phrase.saved { color: #ffd54f; }
  .ytsae-save-phrase[disabled] { cursor: default; opacity: .8; }
  .ytsae-open-favorites {
    background: transparent;
    border: none;
    color: #bdbdbd;
    font-size: 12px;
    line-height: 1;
    padding: 6px 8px;
    border-radius: 999px;
    cursor: pointer;
  }
  .ytsae-open-favorites:hover { color: #ffd54f; background: rgba(255, 255, 255, .08); }
  .ytsae-close {
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 18px;
    line-height: 1;
    padding: 2px 4px;
    cursor: pointer;
  }
  .ytsae-close:hover { color: #fff; }
  .ytsae-phrase {
    padding: 10px 16px 0;
    color: #9aa0a6;
    font-size: 13px;
    font-style: italic;
  }
  .ytsae-body { padding: 12px 16px 18px; overflow-y: auto; }
  .ytsae-body h4 { margin: 12px 0 6px; font-size: 14px; color: #fff; }
  .ytsae-body p { margin: 6px 0; }
  .ytsae-body ul { margin: 6px 0; padding-left: 18px; }
  .ytsae-body code {
    background: rgba(255, 255, 255, .1);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 13px;
  }
  .ytsae-translation { margin: 0 0 4px; color: #efefef; font-size: 15px; }
  .ytsae-words { list-style: none; margin: 6px 0; padding: 0; }
  .ytsae-word { padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, .06); }
  .ytsae-word:last-child { border-bottom: none; }
  .ytsae-word-head { display: flex; align-items: center; gap: 6px; }
  .ytsae-word-term { font-weight: 600; color: #fff; }
  .ytsae-word-translation { color: #c9c9c9; }
  .ytsae-badge {
    font-size: 11px;
    color: #b39ddb;
    border: 1px solid rgba(124, 77, 255, .5);
    border-radius: 999px;
    padding: 1px 7px;
  }
  .ytsae-note { color: #9aa0a6; font-size: 13px; margin-top: 2px; }
  .ytsae-star {
    margin-left: auto;
    background: transparent;
    border: none;
    color: #bdbdbd;
    font-size: 17px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 6px;
    cursor: pointer;
  }
  .ytsae-star:hover { color: #ffd54f; background: rgba(255, 255, 255, .08); }
  .ytsae-star.saved { color: #ffd54f; }
  .ytsae-star[disabled] { cursor: default; opacity: .8; }
  .ytsae-toast {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%) translateY(6px);
    background: rgba(124, 77, 255, .95);
    color: #fff;
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 999px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .18s ease, transform .18s ease;
  }
  .ytsae-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
  .ytsae-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 26px 8px;
    text-align: center;
  }
  .ytsae-spinner {
    width: 26px;
    height: 26px;
    border: 3px solid rgba(255, 255, 255, .18);
    border-top-color: #7c4dff;
    border-radius: 50%;
    animation: ytsae-spin .8s linear infinite;
  }
  @keyframes ytsae-spin { to { transform: rotate(360deg); } }
  .ytsae-error { color: #ff8a80; }
  .ytsae-open-options {
    background: #7c4dff;
    border: none;
    border-radius: 8px;
    color: #fff;
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
  }
  .ytsae-reasoning {
    margin-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, .08);
    padding-top: 10px;
    color: #9aa0a6;
    font-size: 12px;
  }
  .ytsae-reasoning summary { cursor: pointer; }
  .ytsae-reasoning-body { white-space: pre-wrap; margin-top: 8px; }
</style>
<div class="ytsae-backdrop" hidden>
  <div class="ytsae-modal" role="dialog" aria-modal="true" aria-label="Разбор фразы">
    <div class="ytsae-head">
      <h3>✨ Разбор фразы</h3>
      <button class="ytsae-open-favorites" type="button" title="Открыть словарь избранного">⭐ Словарь</button>
      <button class="ytsae-save-phrase" type="button" title="Сохранить фразу в избранное">☆ Фраза</button>
      <button class="ytsae-close" type="button" aria-label="Закрыть">✕</button>
    </div>
    <div class="ytsae-phrase"></div>
    <div class="ytsae-body"></div>
  </div>
</div>`;

window.addEventListener('message', onPageMessage);
document.addEventListener('play', onVideoPlay, true);
document.addEventListener('ended', onVideoEnded, true);
document.addEventListener('keydown', onKeyDown, true);
setInterval(ensureControlButton, 2000);
ensureControlButton();
requestCapturedCaptions();

function onVideoPlay(event) {
  if (!(event.target instanceof HTMLVideoElement)) return;
  hideAll();
}

function onVideoEnded(event) {
  if (!(event.target instanceof HTMLVideoElement)) return;
  hideAll();
}

function onKeyDown(event) {
  if (event.key === 'Escape' && state.modalOpen) {
    event.preventDefault();
    event.stopPropagation();
    hideAll();
  }
}

function ensureControlButton() {
  const player = getPlayer();
  if (!player) return;
  const rightControls = player.querySelector('.ytp-right-controls');
  if (!rightControls) return;
  if (state.controlButton && state.controlButton.isConnected && state.controlButton.parentElement === rightControls) return;
  if (state.controlButton) state.controlButton.remove();

  ensurePageStyles();

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytp-button ' + CONTROL_BUTTON_CLASS;
  button.title = 'Объяснить фразу с помощью DeepSeek';
  button.setAttribute('aria-label', 'Объяснить фразу с помощью DeepSeek');
  button.innerHTML = CONTROL_ICON_SVG;
  Object.assign(button.style, {
    width: '48px',
    height: '100%',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: '0',
    color: '#eee',
    cursor: 'pointer',
  });
  button.addEventListener('click', onExplainClick);

  rightControls.insertBefore(button, rightControls.firstChild);
  state.controlButton = button;
}

function ensurePageStyles() {
  if (document.getElementById(PAGE_STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = PAGE_STYLES_ID;
  style.textContent = `
    .${CONTROL_BUTTON_CLASS} { opacity: .9; }
    .${CONTROL_BUTTON_CLASS}:hover { opacity: 1; color: #fff; }
    .${CONTROL_BUTTON_CLASS}:focus-visible { outline: 2px solid #7c4dff; outline-offset: -2px; border-radius: 4px; }
    .${CONTROL_BUTTON_CLASS}[disabled] { cursor: default; }
  `;
  document.head.appendChild(style);
}

function setControlButtonBusy(busy) {
  const button = state.controlButton;
  if (!button) return;
  button.disabled = busy;
  button.style.opacity = busy ? '0.5' : '';
}

function getPlayer() {
  return document.querySelector('#movie_player.html5-video-player') || document.querySelector('.html5-video-player');
}

function getPlayingVideo() {
  const player = getPlayer();
  const video = player ? player.querySelector('video') : document.querySelector('video');
  return video instanceof HTMLVideoElement ? video : null;
}

function getVideoId() {
  try {
    const url = new URL(location.href);
    const fromQuery = url.searchParams.get('v');
    if (fromQuery) return fromQuery;
    const shorts = url.pathname.match(/^\/shorts\/([\w-]+)/);
    return shorts ? shorts[1] : '';
  } catch {
    return '';
  }
}

function getVideoTitle() {
  return document.title.replace(/\s*[-–]\s*YouTube\s*$/, '').trim();
}

function ensureUi() {
  const player = getPlayer();
  if (!player) return null;
  if (state.host && state.host.isConnected && state.host.parentElement === player) return state.host;

  if (state.host) state.host.remove();
  if (getComputedStyle(player).position === 'static') player.style.position = 'relative';

  const host = document.createElement('div');
  host.id = UI_HOST_ID;
  host.style.position = 'absolute';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483000';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = SHELL_HTML;
  player.appendChild(host);

  state.host = host;
  state.backdrop = shadow.querySelector('.ytsae-backdrop');
  state.phraseEl = shadow.querySelector('.ytsae-phrase');
  state.modalBody = shadow.querySelector('.ytsae-body');

  shadow.querySelector('.ytsae-close').addEventListener('click', closeModal);
  shadow.querySelector('.ytsae-open-favorites').addEventListener('click', () => {
    sendMessage({ action: 'OPEN_FAVORITES' }).catch(() => {});
  });
  state.phraseSaveButton = shadow.querySelector('.ytsae-save-phrase');
  state.phraseSaveButton.addEventListener('click', () => onSavePhrase(state.phraseSaveButton));
  state.backdrop.addEventListener('click', (event) => {
    if (event.target === state.backdrop) closeModal();
  });

  return host;
}

function closeModal() {
  state.modalOpen = false;
  state.requestSeq += 1;
  if (state.backdrop) state.backdrop.hidden = true;
}

function hideAll() {
  closeModal();
}

function showModal() {
  if (!ensureUi()) return;
  state.modalOpen = true;
  state.backdrop.hidden = false;
  state.phraseEl.textContent = '';
  state.lastResult = null;
  state.currentContext = null;
  if (state.phraseSaveButton) {
    state.phraseSaveButton.disabled = false;
    state.phraseSaveButton.textContent = '☆ Фраза';
    state.phraseSaveButton.classList.remove('saved');
  }
  renderStatus('Загружаю субтитры…');
}

function renderStatus(text) {
  state.modalBody.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ytsae-status';
  const spinner = document.createElement('div');
  spinner.className = 'ytsae-spinner';
  const label = document.createElement('div');
  label.textContent = text;
  wrap.append(spinner, label);
  state.modalBody.appendChild(wrap);
}

function renderError(message, code) {
  state.modalBody.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ytsae-status';
  const label = document.createElement('div');
  label.className = 'ytsae-error';
  label.textContent = message || 'Не удалось получить ответ.';
  wrap.appendChild(label);

  if (code === 'NO_API_KEY' || code === 'UNAUTHORIZED') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytsae-open-options';
    button.textContent = 'Открыть настройки';
    button.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
    });
    wrap.appendChild(button);
  }

  state.modalBody.appendChild(wrap);
}

function renderResult(response) {
  const data = response && response.data;
  if (data) renderStructured(data);
  else state.modalBody.innerHTML = renderMarkdown(response?.content || '');

  if (response && response.reasoning) {
    const details = document.createElement('details');
    details.className = 'ytsae-reasoning';
    const summary = document.createElement('summary');
    summary.textContent = 'Ход рассуждений модели';
    const body = document.createElement('div');
    body.className = 'ytsae-reasoning-body';
    body.textContent = response.reasoning;
    details.append(summary, body);
    state.modalBody.appendChild(details);
  }
}

function renderStructured(data) {
  state.lastResult = data;
  const body = state.modalBody;
  body.innerHTML = '';

  if (data.translation) {
    const translation = document.createElement('p');
    translation.className = 'ytsae-translation';
    translation.textContent = data.translation;
    body.appendChild(translation);
  }

  if (Array.isArray(data.words) && data.words.length) {
    const heading = document.createElement('h4');
    heading.textContent = '📚 Разбор ключевых слов/идиом';
    body.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'ytsae-words';
    data.words.forEach((word, index) => list.appendChild(buildWordItem(word, index)));
    body.appendChild(list);
  }
}

function buildWordItem(word, index) {
  const item = document.createElement('li');
  item.className = 'ytsae-word';

  const head = document.createElement('div');
  head.className = 'ytsae-word-head';

  const term = document.createElement('span');
  term.className = 'ytsae-word-term';
  term.textContent = word.term;
  head.appendChild(term);

  if (word.translation) {
    const translation = document.createElement('span');
    translation.className = 'ytsae-word-translation';
    translation.textContent = '— ' + word.translation;
    head.appendChild(translation);
  }

  if (word.isIdiom) {
    const badge = document.createElement('span');
    badge.className = 'ytsae-badge';
    badge.textContent = 'идиома';
    head.appendChild(badge);
  }

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'ytsae-star';
  star.textContent = '☆';
  star.title = 'Сохранить слово в избранное';
  star.dataset.index = String(index);
  star.addEventListener('click', () => onSaveWord(word, star));
  head.appendChild(star);

  item.appendChild(head);

  if (word.note) {
    const note = document.createElement('div');
    note.className = 'ytsae-note';
    note.textContent = word.note;
    item.appendChild(note);
  }

  return item;
}

function buildFavoritePayload(extra) {
  const context = state.currentContext || {};
  return Object.assign({}, extra, {
    context: {
      phrase: context.currentText || '',
      phraseTranslation: context.translation || '',
      videoId: context.videoId || '',
      videoTitle: context.videoTitle || '',
      timeSec: context.timeSec || 0,
    },
  });
}

async function onSaveWord(word, button) {
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = '…';

  try {
    const payload = buildFavoritePayload({
      kind: 'word',
      term: word.term,
      translation: word.translation,
      note: word.note,
      isIdiom: word.isIdiom,
    });
    const response = await sendMessage({ action: 'SAVE_FAVORITE', payload });
    if (response && response.ok) {
      button.textContent = '★';
      button.classList.add('saved');
      showToast(response.duplicate ? 'Уже в избранном' : 'Сохранено, примеры догружаются…');
    } else {
      button.disabled = false;
      button.textContent = '☆';
      showToast(response?.error || 'Не удалось сохранить');
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = '☆';
    showToast('Ошибка: ' + (error?.message || error));
  }
}

async function onSavePhrase(button) {
  const context = state.currentContext || {};
  if (!context.currentText || button.disabled) return;

  button.disabled = true;
  const previous = button.textContent;
  button.textContent = '…';

  try {
    const payload = buildFavoritePayload({
      kind: 'phrase',
      term: context.currentText,
      translation: context.translation || '',
      note: '',
      isIdiom: false,
    });
    const response = await sendMessage({ action: 'SAVE_FAVORITE', payload });
    if (response && response.ok) {
      button.textContent = '★ Фраза';
      button.classList.add('saved');
      showToast(response.duplicate ? 'Фраза уже в избранном' : 'Фраза сохранена');
    } else {
      button.disabled = false;
      button.textContent = previous;
      showToast(response?.error || 'Не удалось сохранить фразу');
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = previous;
    showToast('Ошибка: ' + (error?.message || error));
  }
}

function showToast(text) {
  const host = state.host;
  if (!host || !host.shadowRoot) return;
  const modal = host.shadowRoot.querySelector('.ytsae-modal');
  if (!modal) return;

  let toast = host.shadowRoot.querySelector('.ytsae-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'ytsae-toast';
    modal.appendChild(toast);
  }

  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

async function onExplainClick() {
  const video = getPlayingVideo();
  if (!video) return;
  if (!video.paused) video.pause();

  showModal();
  const requestId = ++state.requestSeq;
  setControlButtonBusy(true);

  try {
    const phrases = await ensurePhrases();
    if (requestId !== state.requestSeq || !state.modalOpen) return;
    if (!phrases || !phrases.length) {
      renderError('Не удалось получить субтитры. Включите CC в плеере и нажмите кнопку ещё раз.');
      return;
    }

    const index = findPhraseIndex(phrases, video.currentTime);
    const payload = buildContext(phrases, index);
    payload.videoTitle = getVideoTitle();
    state.phraseEl.textContent = '«' + payload.currentText + '»';
    state.currentContext = {
      videoId: getVideoId(),
      videoTitle: payload.videoTitle,
      currentText: payload.currentText,
      translation: '',
      timeSec: Math.round(video.currentTime || 0),
    };
    renderStatus('Анализирую фразу с помощью DeepSeek…');

    const response = await sendMessage({ action: 'EXPLAIN_TEXT', payload });
    if (requestId !== state.requestSeq || !state.modalOpen) return;
    if (response && response.ok) {
      if (state.currentContext && response.data) state.currentContext.translation = response.data.translation || '';
      renderResult(response);
    } else {
      renderError(response?.error, response?.code);
    }
  } catch (error) {
    if (requestId === state.requestSeq && state.modalOpen) {
      renderError('Ошибка при обращении к расширению: ' + (error?.message || error));
    }
  } finally {
    setControlButtonBusy(false);
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function onPageMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'ytsae-page') return;
  if (data.type === 'caption-captured') {
    addCapturedCaption(data.url, data.body);
  } else if (data.type === 'captions-list' && Array.isArray(data.items)) {
    for (const item of data.items) addCapturedCaption(item.url, item.body);
  }
}

function addCapturedCaption(url, body) {
  if (!url || typeof body !== 'string' || !body) return;
  const key = url + '|' + body.length;
  if (state.capturedKeys.has(key)) return;
  state.capturedKeys.add(key);
  state.capturedCaptions.push({ url, body });
  while (state.capturedCaptions.length > CAPTURED_LIMIT) {
    const removed = state.capturedCaptions.shift();
    state.capturedKeys.delete(removed.url + '|' + removed.body.length);
  }
}

function requestCapturedCaptions() {
  window.postMessage({ source: 'ytsae-content', type: 'request-captions' }, '*');
}

function capturedForVideo(videoId) {
  return state.capturedCaptions.filter((item) => {
    try {
      return new URL(item.url, location.origin).searchParams.get('v') === videoId;
    } catch {
      return false;
    }
  });
}

function parseCapturedCaptions(videoId) {
  const items = capturedForVideo(videoId);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const phrases = parseCaptionBody(items[i].body);
    if (phrases.length) return { phrases, asr: isAsrUrl(items[i].url) };
  }
  return { phrases: [], asr: false };
}

function isAsrUrl(url) {
  try {
    const params = new URL(url, location.origin).searchParams;
    return params.get('kind') === 'asr' || params.get('caps') === 'asr';
  } catch {
    return false;
  }
}

function parseCaptionBody(body) {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    try {
      return parseJson3(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (trimmed.startsWith('<')) return parseTimedTextXml(trimmed);
  return [];
}

function ensurePhrases() {
  const videoId = getVideoId();
  if (!videoId) return Promise.resolve(null);
  if (state.videoId === videoId && state.phrases && state.phrases.length) return Promise.resolve(state.phrases);
  if (state.loadingPromise && state.loadingVideoId === videoId) return state.loadingPromise;

  state.loadingVideoId = videoId;
  state.loadingPromise = loadPhrases(videoId)
    .then((phrases) => {
      state.videoId = videoId;
      state.phrases = phrases;
      state.loadingPromise = null;
      return phrases;
    })
    .catch((error) => {
      console.warn('[YouTube Subtitle AI Explain]', error);
      state.loadingPromise = null;
      state.phrases = null;
      state.videoId = null;
      return null;
    });

  return state.loadingPromise;
}

async function loadPhrases(videoId) {
  const captured = parseCapturedCaptions(videoId);
  if (captured.phrases.length) return finalizePhrases(captured.phrases, captured.asr);

  const playerResponse = await getPlayerResponse(videoId);
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const track = pickCaptionTrack(tracks);

  if (track?.baseUrl) {
    const direct = await loadTrackDirect(track.baseUrl);
    if (direct.length) return finalizePhrases(direct, track.kind === 'asr');
  }

  if (Array.isArray(tracks) && tracks.length) {
    const viaPlayer = await captureCaptionsViaPlayer(videoId);
    if (viaPlayer.phrases.length) return finalizePhrases(viaPlayer.phrases, viaPlayer.asr);
  }

  console.warn('[YouTube Subtitle AI Explain] Не удалось получить субтитры. Включите субтитры (CC) в плеере и нажмите кнопку ещё раз.');
  return [];
}

function finalizePhrases(phrases, asr) {
  return asr ? mergeAsrSentences(phrases) : phrases;
}

async function loadTrackDirect(baseUrl) {
  const jsonText = await fetchCaptionText(baseUrl + '&fmt=json3');
  if (jsonText) {
    try {
      const phrases = parseJson3(JSON.parse(jsonText));
      if (phrases.length) return phrases;
    } catch (error) {
      console.warn('[YouTube Subtitle AI Explain] Не удалось разобрать json3:', error);
    }
  }

  const xmlText = await fetchCaptionText(baseUrl);
  if (xmlText && xmlText.trim().startsWith('<')) return parseTimedTextXml(xmlText);
  return [];
}

async function captureCaptionsViaPlayer(videoId) {
  requestCapturedCaptions();
  const button = document.querySelector('.ytp-subtitles-button');
  if (!button) return { phrases: [], asr: false };

  await delay(100);
  const already = parseCapturedCaptions(videoId);
  if (already.phrases.length) return already;

  const wasOn = button.getAttribute('aria-pressed') === 'true';
  const initialCount = capturedForVideo(videoId).length;

  if (wasOn) {
    button.click();
    await delay(250);
  }
  button.click();

  const captured = await waitForCaptured(videoId, initialCount, CAPTION_CAPTURE_TIMEOUT_MS);

  if (!wasOn) {
    button.click();
    await delay(50);
  }

  return captured;
}

function waitForCaptured(videoId, previousCount, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (capturedForVideo(videoId).length > previousCount) {
        resolve(parseCapturedCaptions(videoId));
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve({ phrases: [], asr: false });
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPlayerResponse(videoId) {
  const fromDom = extractPlayerResponseFromScripts();
  if (fromDom && fromDom.videoDetails?.videoId === videoId) return fromDom;

  const response = await fetchWithTimeout(location.href, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Не удалось загрузить страницу видео (HTTP ' + response.status + ')');
  const html = await response.text();
  return extractPlayerResponseFromText(html);
}

function extractPlayerResponseFromScripts() {
  for (const script of document.scripts) {
    const text = script.textContent;
    if (!text || !text.includes('ytInitialPlayerResponse')) continue;
    const parsed = extractPlayerResponseFromText(text);
    if (parsed) return parsed;
  }
  return null;
}

function extractPlayerResponseFromText(text) {
  const marker = 'ytInitialPlayerResponse';
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) return null;

    const braceIndex = text.indexOf('{', markerIndex);
    if (braceIndex !== -1 && braceIndex - markerIndex < 200) {
      const candidate = extractBalancedObject(text, braceIndex);
      if (candidate) {
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object' && parsed.videoDetails) return parsed;
        } catch {
          searchFrom = markerIndex + marker.length;
          continue;
        }
      }
    }

    searchFrom = markerIndex + marker.length;
  }

  return null;
}

function extractBalancedObject(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function pickCaptionTrack(tracks) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const score = (track) => {
    let value = 0;
    if (String(track.languageCode || '').toLowerCase().startsWith('en')) value += 4;
    if (track.kind !== 'asr') value += 2;
    return value;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

async function fetchCaptionText(url) {
  try {
    const response = await fetchWithTimeout(url, { credentials: 'same-origin' });
    if (!response.ok) return '';
    const text = await response.text();
    return text && text.trim() ? text : '';
  } catch {
    return '';
  }
}

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

function buildContext(phrases, index) {
  const from = Math.max(0, index - MAX_CONTEXT_PHRASES);
  const to = Math.min(phrases.length, index + MAX_CONTEXT_PHRASES + 1);
  return {
    prevText: phrases
      .slice(from, index)
      .map((phrase) => phrase.text)
      .join(' '),
    currentText: phrases[index].text,
    nextText: phrases
      .slice(index + 1, to)
      .map((phrase) => phrase.text)
      .join(' '),
  };
}

function findPhraseIndex(phrases, time) {
  let index = 0;
  for (let i = 0; i < phrases.length; i += 1) {
    if (phrases[i].start <= time + PHRASE_MATCH_TOLERANCE_SEC) index = i;
    else break;
  }
  return index;
}

function parseJson3(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const rolling = events.some((event) => event && (event.aAppend || event.wWinId));
  const phrases = rolling ? parseRollingEvents(events) : parseSimpleEvents(events);

  for (let i = 0; i < phrases.length; i += 1) {
    if (typeof phrases[i].end !== 'number') {
      phrases[i].end = i + 1 < phrases.length ? phrases[i + 1].start : phrases[i].start + 4;
    }
  }

  return phrases;
}

function parseSimpleEvents(events) {
  const phrases = [];
  for (const event of events) {
    const text = eventText(event);
    if (!text.trim()) continue;
    phrases.push({ start: (event.tStartMs || 0) / 1000, end: eventEnd(event), text });
  }
  return dedupePhrases(phrases);
}

function eventEnd(event) {
  if (typeof event?.tStartMs !== 'number' || typeof event?.dDurationMs !== 'number' || event.dDurationMs <= 0) {
    return undefined;
  }
  return (event.tStartMs + event.dDurationMs) / 1000;
}

function parseRollingEvents(events) {
  const phrases = [];
  let buffer = '';
  let startMs = null;
  let endSec = null;

  const flush = () => {
    const text = buffer.trim();
    if (text && startMs !== null) {
      phrases.push({ start: startMs / 1000, end: endSec === null ? undefined : endSec, text });
    }
    buffer = '';
    startMs = null;
    endSec = null;
  };

  for (const event of events) {
    const raw = eventText(event);
    const parts = raw.split('\n');

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.trim()) {
        if (startMs === null && typeof event.tStartMs === 'number') startMs = event.tStartMs;
        const end = eventEnd(event);
        if (typeof end === 'number') endSec = end;
        buffer = appendFragment(buffer, part);
        if (buffer.length > MAX_PHRASE_LENGTH) flush();
      }
      if (i < parts.length - 1) flush();
    }
  }

  flush();
  return dedupePhrases(phrases);
}

function appendFragment(buffer, fragment) {
  const piece = fragment.trim();
  if (!piece) return buffer;

  const current = buffer.trim();
  if (!current) return piece;
  if (piece.startsWith(current)) return piece;

  const needsSpace = /[\p{L}\p{N}]$/u.test(buffer) && /^[\p{L}\p{N}]/u.test(piece);
  return buffer + (needsSpace ? ' ' : '') + piece;
}

function dedupePhrases(phrases) {
  const result = [];
  for (const phrase of phrases) {
    const text = phrase.text.replace(/\s+/g, ' ').trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    const prev = result[result.length - 1];
    if (prev && (prev.text === text || prev.text.startsWith(text))) continue;
    result.push({ start: phrase.start, end: phrase.end, text });
  }
  return result;
}

function mergeAsrSentences(phrases) {
  const merged = [];
  let current = null;
  let lastEnd = null;

  for (const phrase of phrases) {
    const text = phrase.text.trim();
    if (!text) continue;
    const end = typeof phrase.end === 'number' ? phrase.end : phrase.start;
    const gap = lastEnd === null ? 0 : phrase.start - lastEnd;
    const startNew =
      !current ||
      gap > ASR_SENTENCE_GAP_SEC ||
      endsSentence(current.text) ||
      current.text.length + text.length > MAX_PHRASE_LENGTH;

    if (startNew) {
      if (current) merged.push(current);
      current = { start: phrase.start, end, text };
    } else {
      current.text = current.text + ' ' + text;
      current.end = end;
    }

    lastEnd = end;
  }

  if (current) merged.push(current);
  return merged;
}

function endsSentence(text) {
  return /[.!?…]["')\]]?$/.test(text.trim());
}

function eventText(event) {
  if (!event || !Array.isArray(event.segs)) return '';
  return event.segs.map((seg) => (typeof seg?.utf8 === 'string' ? seg.utf8 : '')).join('');
}

function parseTimedTextXml(xmlText) {
  const documentNode = new DOMParser().parseFromString(xmlText, 'text/xml');
  const phrases = [];

  const paragraphs = documentNode.getElementsByTagName('p');
  if (paragraphs.length) {
    for (const node of paragraphs) {
      const text = node.textContent || '';
      if (!text.trim()) continue;
      const start = parseFloat(node.getAttribute('t') || '0') / 1000;
      const duration = parseFloat(node.getAttribute('d') || '0') / 1000;
      phrases.push({ start, end: duration > 0 ? start + duration : undefined, text });
    }
    return dedupePhrases(phrases);
  }

  for (const node of documentNode.getElementsByTagName('text')) {
    const text = node.textContent || '';
    if (!text.trim()) continue;
    const start = parseFloat(node.getAttribute('start') || '0');
    const duration = parseFloat(node.getAttribute('dur') || '0');
    phrases.push({ start, end: duration > 0 ? start + duration : undefined, text });
  }
  return dedupePhrases(phrases);
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split('\n');
  const html = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      closeList();
      html.push('<h4>' + renderInline(heading[1]) + '</h4>');
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push('<li>' + renderInline(bullet[1]) + '</li>');
      continue;
    }

    closeList();
    html.push('<p>' + renderInline(line) + '</p>');
  }

  closeList();
  return html.join('');
}

function renderInline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
