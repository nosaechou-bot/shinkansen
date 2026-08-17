// content-live-caption.js — Live Caption Floating Subtitle Overlay (with History & Dual Mode Support)

(function() {
  // Only execute in the top-level main window, ignoring iframes (e.g. YouTube live chat)
  if (window !== window.top) return;

  let captionContainer = null;
  let bodyEl = null;
  let dualToggleBtn = null;
  let historyList = [];
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let currentDisplayMode = 'dual'; // default to dual mode so user sees original & translated by default
  const MAX_HISTORY_ITEMS = 25;

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
        <div class="shinkansen-live-caption-actions">
          <button class="shinkansen-live-caption-btn shinkansen-live-caption-dual-toggle ${currentDisplayMode === 'dual' ? 'active' : ''}" title="切換原文與翻譯對照模式">雙語對照</button>
          <button class="shinkansen-live-caption-btn shinkansen-live-caption-clear" title="清空歷史字幕">清空</button>
          <button class="shinkansen-live-caption-btn shinkansen-live-caption-close" title="關閉即時字幕">✕</button>
        </div>
      </div>
      <div class="shinkansen-live-caption-body">
        <div class="shinkansen-live-caption-item latest">
          <div class="shinkansen-live-caption-item-trans">正在監聽音訊…</div>
        </div>
      </div>
    `;

    document.body.appendChild(captionContainer);
    bodyEl = captionContainer.querySelector('.shinkansen-live-caption-body');
    dualToggleBtn = captionContainer.querySelector('.shinkansen-live-caption-dual-toggle');

    // Dual mode toggle button
    dualToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDisplayMode = currentDisplayMode === 'dual' ? 'single' : 'dual';
      updateDualToggleButtonState();
      renderAllHistory();
    });

    // Clear history button
    const clearBtn = captionContainer.querySelector('.shinkansen-live-caption-clear');
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      historyList = [];
      bodyEl.innerHTML = `
        <div class="shinkansen-live-caption-item latest">
          <div class="shinkansen-live-caption-item-trans">已清空歷史字幕，監聽中…</div>
        </div>
      `;
    });

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
      if (e.target.closest('.shinkansen-live-caption-btn')) return;
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

  function updateDualToggleButtonState() {
    if (!dualToggleBtn) return;
    if (currentDisplayMode === 'dual') {
      dualToggleBtn.classList.add('active');
      dualToggleBtn.textContent = '雙語對照 ✓';
    } else {
      dualToggleBtn.classList.remove('active');
      dualToggleBtn.textContent = '純譯文';
    }
  }

  function renderAllHistory() {
    if (!bodyEl) return;
    if (historyList.length === 0) return;

    let html = '';
    historyList.forEach((item, index) => {
      const isLatest = index === historyList.length - 1;
      const itemClass = isLatest ? 'shinkansen-live-caption-item latest' : 'shinkansen-live-caption-item historical';

      let itemContent = '';
      if (currentDisplayMode === 'dual' && item.original) {
        itemContent += `<div class="shinkansen-live-caption-item-orig">${escapeHtml(item.original)}</div>`;
      }
      if (item.translated) {
        itemContent += `<div class="shinkansen-live-caption-item-trans">${escapeHtml(item.translated)}</div>`;
      }

      html += `<div class="${itemClass}">${itemContent}</div>`;
    });

    bodyEl.innerHTML = html;
    bodyEl.scrollTop = bodyEl.scrollHeight;
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

  function renderCaption({ original, translated, displayMode }) {
    ensureCaptionOverlay();
    showOverlay();

    if (displayMode && displayMode !== currentDisplayMode) {
      currentDisplayMode = displayMode;
      updateDualToggleButtonState();
    }

    if (!translated && !original) return;

    // Check if duplicate of last entry
    const lastItem = historyList[historyList.length - 1];
    if (lastItem && lastItem.translated === translated && lastItem.original === original) {
      return;
    }

    // Add to history
    historyList.push({
      id: Date.now() + Math.random(),
      original: (original || '').trim(),
      translated: (translated || '').trim(),
    });

    if (historyList.length > MAX_HISTORY_ITEMS) {
      historyList.shift();
    }

    renderAllHistory();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
