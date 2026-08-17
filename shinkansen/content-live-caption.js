// content-live-caption.js — Live Caption Floating Subtitle Overlay

(function() {
  // Only execute in the top-level main window, ignoring iframes (e.g. YouTube live chat)
  if (window !== window.top) return;

  let captionContainer = null;
  let originalEl = null;
  let translatedEl = null;
  let autoClearTimer = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function ensureCaptionOverlay() {
    if (captionContainer) return;

    // Inject CSS
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('content-live-caption.css');
    document.head.appendChild(styleLink);

    // Create Container
    captionContainer = document.createElement('div');
    captionContainer.className = 'shinkansen-live-caption-container';
    captionContainer.innerHTML = `
      <div class="shinkansen-live-caption-header">
        <span class="shinkansen-live-caption-title">LIVE CAPTION</span>
        <button class="shinkansen-live-caption-close" title="關閉即時字幕">✕</button>
      </div>
      <div class="shinkansen-live-caption-body">
        <div class="shinkansen-live-caption-original" style="display: none;"></div>
        <div class="shinkansen-live-caption-translated">正在監聽音訊…</div>
      </div>
    `;

    document.body.appendChild(captionContainer);

    originalEl = captionContainer.querySelector('.shinkansen-live-caption-original');
    translatedEl = captionContainer.querySelector('.shinkansen-live-caption-translated');

    // Close button
    const closeBtn = captionContainer.querySelector('.shinkansen-live-caption-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'STOP_LIVE_CAPTION' });
      hideOverlay();
    });

    // Dragging logic
    const header = captionContainer.querySelector('.shinkansen-live-caption-header');
    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = captionContainer.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !captionContainer) return;
      const left = e.clientX - dragOffset.x;
      const top = e.clientY - dragOffset.y;
      captionContainer.style.left = `${left}px`;
      captionContainer.style.top = `${top}px`;
      captionContainer.style.bottom = 'auto';
      captionContainer.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  function showOverlay() {
    ensureCaptionOverlay();
    if (captionContainer) {
      captionContainer.classList.remove('hidden');
    }
  }

  function hideOverlay() {
    if (captionContainer) {
      captionContainer.classList.add('hidden');
    }
  }

  function renderCaption({ original, translated, displayMode = 'single' }) {
    ensureCaptionOverlay();
    showOverlay();

    if (!translated && !original) return;

    if (displayMode === 'dual' && original) {
      originalEl.style.display = 'block';
      originalEl.textContent = original;
    } else {
      originalEl.style.display = 'none';
      originalEl.textContent = '';
    }

    if (translated) {
      translatedEl.textContent = translated;
    }

    // Keep subtitle visible smoothly for 12s without abrupt clearing
    clearTimeout(autoClearTimer);
    autoClearTimer = setTimeout(() => {
      if (translatedEl && translatedEl.textContent) {
        translatedEl.style.opacity = '0.5';
      }
    }, 12000);
    if (translatedEl) {
      translatedEl.style.opacity = '1';
    }
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LIVE_CAPTION_START') {
      showOverlay();
      sendResponse({ ok: true });
    } else if (message.type === 'LIVE_CAPTION_RENDER') {
      renderCaption(message.payload || {});
      sendResponse({ ok: true });
    } else if (message.type === 'LIVE_CAPTION_STOP') {
      hideOverlay();
      sendResponse({ ok: true });
    }
  });
})();
