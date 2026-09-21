const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';
const REASONER_MODEL = 'deepseek-reasoner';
const FAVORITES_PREFIX = 'fav:';

const SYSTEM_PROMPT = [
  'Ты — профессиональный лингвист и репетитор. Переведи выделенную фразу на русский с учётом окружающего контекста и разбери сложную лексику, сленг и грамматику.',
  'Контекст ДО и ПОСЛЕ используй только для более точного перевода: не выводи его отдельным разделом и не пересказывай.',
  'Верни ТОЛЬКО JSON без markdown-обёртки и пояснений, строго такой структуры:',
  '{"translation":"точный перевод фразы на русский","words":[{"term":"слово или идиома","translation":"перевод","note":"краткое пояснение грамматики и употребления","isIdiom":false}]}',
  'В words добавь самые важные слова и идиомы из фразы (до 8). Пиши по-русски, кратко и по делу. Если фраза является частью предложения, переводи её с учётом контекста.',
].join('\n');

const EXAMPLES_SYSTEM_PROMPT = [
  'Ты — репетитор английского языка. Для заданного слова или выражения дай 2 коротких примера употребления на языке оригинала с переводом на русский.',
  'Верни ТОЛЬКО JSON без markdown-обёртки и пояснений, строго такой структуры:',
  '{"examples":[{"text":"пример предложения","translation":"перевод примера"}]}',
].join('\n');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;

  if (message.action === 'EXPLAIN_TEXT') {
    handleExplain(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: 'Внутренняя ошибка расширения: ' + (error?.message || error) }));
    return true;
  }

  if (message.action === 'SAVE_FAVORITE') {
    handleSaveFavorite(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: 'Не удалось сохранить: ' + (error?.message || error) }));
    return true;
  }

  if (message.action === 'GENERATE_EXAMPLES') {
    handleGenerateExamples(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: 'Не удалось получить примеры: ' + (error?.message || error) }));
    return true;
  }

  if (message.action === 'OPEN_FAVORITES') {
    chrome.tabs.create({ url: chrome.runtime.getURL('favorites.html') });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  return undefined;
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

async function handleExplain(payload) {
  const context = payload || {};
  const currentText = (context.currentText || '').trim();
  if (!currentText) {
    return { ok: false, code: 'EMPTY_PHRASE', error: 'Не удалось определить фразу субтитров на этой позиции.' };
  }

  const settings = await chrome.storage.sync.get({ apiKey: '', model: DEFAULT_MODEL });
  const apiKey = String(settings.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, code: 'NO_API_KEY', error: 'API-ключ DeepSeek не задан. Откройте настройки расширения и сохраните ключ.' };
  }

  const model = settings.model === REASONER_MODEL ? REASONER_MODEL : DEFAULT_MODEL;
  const timeoutMs = model === REASONER_MODEL ? 180000 : 90000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model,
      messages: buildMessages(context, currentText),
      stream: false,
    };
    if (model === DEFAULT_MODEL) {
      body.temperature = 0.3;
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return mapApiError(response.status, data);
    }

    const answer = data?.choices?.[0]?.message || {};
    const content = String(answer.content || '').trim();
    if (!content) {
      return { ok: false, code: 'EMPTY_RESPONSE', error: 'DeepSeek вернул пустой ответ. Попробуйте ещё раз.' };
    }

    const parsed = parseExplainJson(content);
    if (parsed) {
      return {
        ok: true,
        model,
        data: parsed,
        reasoning: String(answer.reasoning_content || '').trim(),
      };
    }

    return {
      ok: true,
      model,
      content,
      reasoning: String(answer.reasoning_content || '').trim(),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, code: 'TIMEOUT', error: 'DeepSeek не ответил вовремя. Попробуйте ещё раз или выберите модель deepseek-chat.' };
    }
    return { ok: false, code: 'NETWORK', error: 'Не удалось связаться с DeepSeek: ' + (error?.message || 'network error') };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildMessages(context, currentText) {
  const prevText = (context.prevText || '').trim();
  const nextText = (context.nextText || '').trim();
  const videoTitle = (context.videoTitle || '').trim();

  const lines = [];
  if (videoTitle) lines.push('Видео: «' + videoTitle + '»');
  lines.push('Контекст ДО: "' + (prevText || '—') + '"');
  lines.push('ФРАЗА ДЛЯ РАЗБОРА: "' + currentText + '"');
  lines.push('Контекст ПОСЛЕ: "' + (nextText || '—') + '"');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ];
}

function mapApiError(status, data) {
  const detail = data?.error?.message ? ' ' + data.error.message : '';
  switch (status) {
    case 400:
    case 422:
      return { ok: false, code: 'BAD_REQUEST', error: 'DeepSeek отклонил запрос.' + detail };
    case 401:
      return { ok: false, code: 'UNAUTHORIZED', error: 'Неверный API-ключ DeepSeek. Проверьте настройки расширения.' };
    case 402:
      return { ok: false, code: 'NO_BALANCE', error: 'На балансе DeepSeek недостаточно средств.' };
    case 429:
      return { ok: false, code: 'RATE_LIMIT', error: 'Слишком много запросов к DeepSeek. Попробуйте через минуту.' };
    case 500:
    case 502:
    case 503:
      return { ok: false, code: 'SERVER_ERROR', error: 'Сервис DeepSeek временно недоступен. Попробуйте позже.' };
    default:
      return { ok: false, code: 'HTTP_' + status, error: 'Ошибка DeepSeek (HTTP ' + status + ').' + detail };
  }
}

async function handleSaveFavorite(payload) {
  const data = payload || {};
  const term = String(data.term || '').trim();
  if (!term) return { ok: false, error: 'Не удалось определить слово для сохранения.' };

  const kind = data.kind === 'phrase' ? 'phrase' : 'word';
  const existing = await findFavoriteByTerm(term, kind);
  if (existing) return { ok: true, id: existing.id, duplicate: true };

  const context = data.context || {};
  const record = {
    id: newFavoriteId(),
    kind,
    term,
    translation: String(data.translation || '').trim(),
    note: String(data.note || '').trim(),
    isIdiom: Boolean(data.isIdiom),
    examples: [],
    context: {
      phrase: String(context.phrase || '').trim(),
      phraseTranslation: String(context.phraseTranslation || '').trim(),
      videoId: String(context.videoId || ''),
      videoTitle: String(context.videoTitle || ''),
      timeSec: Number(context.timeSec) || 0,
    },
    learned: false,
    createdAt: Date.now(),
    schemaVersion: 1,
  };

  await chrome.storage.local.set({ [FAVORITES_PREFIX + record.id]: record });

  if (kind === 'word') {
    enrichWithExamples(record.id, record.term, record.context.phrase).catch(() => {});
  }

  return { ok: true, id: record.id, duplicate: false };
}

async function handleGenerateExamples(payload) {
  const id = String(payload?.id || '');
  if (!id) return { ok: false, error: 'Не указана запись.' };

  const key = FAVORITES_PREFIX + id;
  const stored = await chrome.storage.local.get(key);
  const record = stored[key];
  if (!record) return { ok: false, error: 'Запись не найдена.' };

  const examples = await generateExamples(record.term, record.context?.phrase || '');
  if (!examples.length) return { ok: false, error: 'Не удалось получить примеры. Проверьте API-ключ DeepSeek.' };

  record.examples = examples;
  await chrome.storage.local.set({ [key]: record });
  return { ok: true, examples };
}

async function enrichWithExamples(id, term, contextPhrase) {
  const examples = await generateExamples(term, contextPhrase);
  if (!examples.length) return;

  const key = FAVORITES_PREFIX + id;
  const stored = await chrome.storage.local.get(key);
  const record = stored[key];
  if (!record) return;

  record.examples = examples;
  await chrome.storage.local.set({ [key]: record });
}

async function generateExamples(term, contextPhrase) {
  const settings = await chrome.storage.sync.get({ apiKey: '', model: DEFAULT_MODEL });
  const apiKey = String(settings.apiKey || '').trim();
  if (!apiKey) return [];

  const model = settings.model === REASONER_MODEL ? REASONER_MODEL : DEFAULT_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const lines = ['Слово или выражение: "' + term + '"'];
    if (contextPhrase) lines.push('Контекст из видео: "' + contextPhrase + '"');

    const body = {
      model,
      messages: [
        { role: 'system', content: EXAMPLES_SYSTEM_PROMPT },
        { role: 'user', content: lines.join('\n') },
      ],
      stream: false,
      temperature: 0.7,
    };
    if (model === DEFAULT_MODEL) body.response_format = { type: 'json_object' };

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const data = await response.json().catch(() => null);
    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    return parseExamplesJson(content);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function listFavorites() {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(FAVORITES_PREFIX))
    .map(([, value]) => value);
}

async function findFavoriteByTerm(term, kind) {
  const normalized = normalizeTerm(term);
  const favorites = await listFavorites();
  return favorites.find((item) => item.kind === kind && normalizeTerm(item.term) === normalized) || null;
}

function normalizeTerm(term) {
  return String(term || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function newFavoriteId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // ignore
  }
  return 'fav-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function parseExplainJson(text) {
  const obj = parseJsonObject(text);
  if (!obj || typeof obj !== 'object') return null;

  const translation = String(obj.translation || '').trim();
  const rawWords = Array.isArray(obj.words) ? obj.words : [];
  const words = [];

  for (const item of rawWords) {
    if (!item || typeof item !== 'object') continue;
    const term = String(item.term || '').trim();
    if (!term) continue;
    words.push({
      term,
      translation: String(item.translation || '').trim(),
      note: String(item.note || '').trim(),
      isIdiom: Boolean(item.isIdiom),
    });
  }

  if (!translation && !words.length) return null;
  return { translation, words };
}

function parseExamplesJson(text) {
  const obj = parseJsonObject(text);
  const raw = obj && Array.isArray(obj.examples) ? obj.examples : [];
  const examples = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const example = String(item.text || '').trim();
    if (!example) continue;
    examples.push({ text: example, translation: String(item.translation || '').trim() });
  }

  return examples.slice(0, 3);
}

function parseJsonObject(text) {
  let source = String(text || '').trim();
  if (!source) return null;

  const fence = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) source = fence[1].trim();

  const start = source.indexOf('{');
  if (start === -1) return null;

  const candidate = extractBalancedObject(source, start);
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
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
