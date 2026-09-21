const FAVORITES_PREFIX = 'fav:';

const listEl = document.getElementById('list');
const searchInput = document.getElementById('search');
const filterSelect = document.getElementById('filter');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');

let favorites = [];

init();

async function init() {
  await reload();
  searchInput.addEventListener('input', render);
  filterSelect.addEventListener('change', render);
  document.getElementById('export-json').addEventListener('click', exportJson);
  document.getElementById('export-csv').addEventListener('click', exportCsv);
}

async function reload() {
  const all = await chrome.storage.local.get(null);
  favorites = Object.entries(all)
    .filter(([key]) => key.startsWith(FAVORITES_PREFIX))
    .map(([, value]) => value)
    .filter((item) => item && typeof item === 'object')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  render();
}

function visibleFavorites() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;

  return favorites.filter((item) => {
    if (filter === 'word' && item.kind !== 'word') return false;
    if (filter === 'phrase' && item.kind !== 'phrase') return false;
    if (filter === 'unlearned' && item.learned) return false;
    if (!query) return true;

    const haystack = [
      item.term,
      item.translation,
      item.note,
      item.context?.phrase,
      item.context?.videoTitle,
      ...(Array.isArray(item.examples) ? item.examples.map((example) => example.text) : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function render() {
  const items = visibleFavorites();
  listEl.innerHTML = '';

  countEl.textContent = favorites.length ? favorites.length + ' записей' : '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = favorites.length
      ? 'Ничего не найдено.'
      : 'Пока пусто. Откройте видео на YouTube, нажмите «✨ Разбор фразы» и сохраните слова или фразы.';
    listEl.appendChild(empty);
    return;
  }

  for (const item of items) listEl.appendChild(buildCard(item));
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'card' + (item.learned ? ' learned' : '');

  const head = document.createElement('div');
  head.className = 'card-head';

  const term = document.createElement('span');
  term.className = 'term';
  term.textContent = item.term;
  head.appendChild(term);

  if (item.translation) {
    const translation = document.createElement('span');
    translation.className = 'term-tr';
    translation.textContent = '— ' + item.translation;
    head.appendChild(translation);
  }

  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = item.kind === 'phrase' ? 'фраза' : 'слово';
  head.appendChild(kind);

  if (item.isIdiom) {
    const idiom = document.createElement('span');
    idiom.className = 'badge-idiom';
    idiom.textContent = 'идиома';
    head.appendChild(idiom);
  }

  if (item.learned) {
    const learned = document.createElement('span');
    learned.className = 'learned-badge';
    learned.textContent = '✓ выучено';
    head.appendChild(learned);
  }

  card.appendChild(head);

  if (item.note) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = item.note;
    card.appendChild(note);
  }

  if (Array.isArray(item.examples) && item.examples.length) {
    const list = document.createElement('ul');
    list.className = 'examples';
    for (const example of item.examples) {
      const li = document.createElement('li');
      li.textContent = example.text;
      if (example.translation) {
        const tr = document.createElement('div');
        tr.className = 'example-tr';
        tr.textContent = example.translation;
        li.appendChild(tr);
      }
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  if (item.context && (item.context.phrase || item.context.videoTitle)) {
    const context = document.createElement('div');
    context.className = 'context';
    if (item.context.phrase) {
      const phrase = document.createElement('span');
      phrase.className = 'ctx-phrase';
      phrase.textContent = '«' + item.context.phrase + '»';
      context.appendChild(phrase);
    }
    if (item.context.videoTitle) {
      const title = document.createElement('span');
      title.textContent = (item.context.phrase ? ' · ' : '') + item.context.videoTitle;
      context.appendChild(title);
    }
    card.appendChild(context);
  }

  card.appendChild(buildActions(item));
  return card;
}

function buildActions(item) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (item.context?.videoId) {
    const link = document.createElement('a');
    link.href = 'https://www.youtube.com/watch?v=' + item.context.videoId + '&t=' + (item.context.timeSec || 0) + 's';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Открыть в видео';
    actions.appendChild(link);
  }

  if (item.kind === 'word' && (!item.examples || !item.examples.length)) {
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'link-btn';
    load.textContent = 'Догрузить примеры';
    load.addEventListener('click', () => loadExamples(item, load));
    actions.appendChild(load);
  }

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  actions.appendChild(spacer);

  const learned = document.createElement('button');
  learned.type = 'button';
  learned.className = 'link-btn';
  learned.textContent = item.learned ? 'Вернуть в изучение' : 'Отметить выученным';
  learned.addEventListener('click', () => toggleLearned(item));
  actions.appendChild(learned);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'link-btn danger';
  remove.textContent = 'Удалить';
  remove.addEventListener('click', () => removeFavorite(item));
  actions.appendChild(remove);

  return actions;
}

async function loadExamples(item, button) {
  button.disabled = true;
  button.textContent = 'Загружаю…';
  setStatus('');

  try {
    const response = await sendMessage({ action: 'GENERATE_EXAMPLES', payload: { id: item.id } });
    if (response && response.ok) {
      item.examples = response.examples;
      render();
      return;
    }
    button.disabled = false;
    button.textContent = 'Догрузить примеры';
    setStatus(response?.error || 'Не удалось получить примеры.', 'err');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Догрузить примеры';
    setStatus('Ошибка: ' + (error?.message || error), 'err');
  }
}

async function toggleLearned(item) {
  item.learned = !item.learned;
  await chrome.storage.local.set({ [FAVORITES_PREFIX + item.id]: item });
  render();
}

async function removeFavorite(item) {
  if (!window.confirm('Удалить «' + item.term + '» из избранного?')) return;
  await chrome.storage.local.remove(FAVORITES_PREFIX + item.id);
  favorites = favorites.filter((entry) => entry.id !== item.id);
  render();
}

function exportJson() {
  downloadFile('favorites.json', JSON.stringify(favorites, null, 2), 'application/json');
}

function exportCsv() {
  const header = ['term', 'translation', 'kind', 'note', 'isIdiom', 'examples', 'context', 'videoUrl', 'createdAt'];
  const rows = favorites.map((item) => [
    item.term,
    item.translation,
    item.kind,
    item.note,
    item.isIdiom ? 'yes' : '',
    (item.examples || []).map((example) => example.text + ' — ' + example.translation).join(' | '),
    item.context?.phrase || '',
    item.context?.videoId
      ? 'https://www.youtube.com/watch?v=' + item.context.videoId + '&t=' + (item.context.timeSec || 0) + 's'
      : '',
    new Date(item.createdAt || Date.now()).toISOString(),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile('favorites.csv', csv, 'text/csv');
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function setStatus(text, kind) {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}
