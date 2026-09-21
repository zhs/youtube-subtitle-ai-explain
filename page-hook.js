(() => {
  const CAPTION_URL_MARKER = '/api/timedtext';
  const buffer = [];

  function isCaptionUrl(url) {
    return typeof url === 'string' && url.indexOf(CAPTION_URL_MARKER) !== -1;
  }

  function publish(url, body) {
    if (typeof body !== 'string' || !body) return;
    buffer.push({ url, body, time: Date.now() });
    while (buffer.length > 10) buffer.shift();
    window.postMessage({ source: 'ytsae-page', type: 'caption-captured', url, body }, '*');
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      const result = originalFetch.apply(this, arguments);
      if (isCaptionUrl(url)) {
        result
          .then((response) => {
            try {
              response
                .clone()
                .text()
                .then((body) => publish(url, body))
                .catch(() => {});
            } catch (error) {
              void error;
            }
            return response;
          })
          .catch(() => {});
      }
      return result;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ytsaeUrl = typeof url === 'string' ? url : String(url);
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url = this.__ytsaeUrl;
    if (isCaptionUrl(url)) {
      this.addEventListener('load', () => {
        try {
          if (typeof this.responseText === 'string') publish(url, this.responseText);
        } catch (error) {
          void error;
        }
      });
    }
    return originalSend.apply(this, arguments);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'ytsae-content' || data.type !== 'request-captions') return;
    window.postMessage({ source: 'ytsae-page', type: 'captions-list', items: buffer.slice() }, '*');
  });
})();
