const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model');
const statusEl = document.getElementById('status');
const form = document.getElementById('settings-form');
const toggleButton = document.getElementById('toggle-key');
const checkButton = document.getElementById('check-key');
const favoritesButton = document.getElementById('open-favorites');

const DEFAULT_SETTINGS = { apiKey: '', model: 'deepseek-chat' };

restoreSettings();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set({
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
  });
  setStatus('Сохранено', 'ok');
});

toggleButton.addEventListener('click', () => {
  const hidden = apiKeyInput.type === 'password';
  apiKeyInput.type = hidden ? 'text' : 'password';
  toggleButton.textContent = hidden ? 'Скрыть' : 'Показать';
});

favoritesButton.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('favorites.html') });
});

checkButton.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Сначала введите ключ', 'err');
    return;
  }

  setStatus('Проверяю…', '');
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: 'Bearer ' + apiKey },
    });
    if (response.ok) setStatus('Ключ действителен', 'ok');
    else if (response.status === 401) setStatus('Ключ недействителен (401)', 'err');
    else setStatus('DeepSeek ответил HTTP ' + response.status, 'err');
  } catch (error) {
    setStatus('Нет связи с DeepSeek: ' + (error?.message || error), 'err');
  }
});

async function restoreSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  apiKeyInput.value = settings.apiKey || '';
  modelSelect.value = settings.model === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}
