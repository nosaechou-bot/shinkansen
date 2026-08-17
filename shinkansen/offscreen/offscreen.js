// offscreen.js — Handles Web Audio & tabCapture MediaStream processing in Chrome MV3

let currentMediaStream = null;
let currentAudioContext = null;
let activeRecorder = null;
let isCapturing = false;
let targetTabId = null;
let recorderTimeout = null;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function recordChunkCycle(chunkDurationMs = 3800) {
  if (!isCapturing || !currentMediaStream) return;

  let mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'audio/webm';
  }

  const chunks = [];
  try {
    activeRecorder = new MediaRecorder(currentMediaStream, { mimeType });
  } catch (err) {
    console.error('[Shinkansen Offscreen] Failed to create MediaRecorder:', err);
    return;
  }

  activeRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  activeRecorder.onstop = async () => {
    if (!isCapturing) return;
    const fullBlob = new Blob(chunks, { type: mimeType });
    chunks.length = 0;

    // Filter tiny empty blobs (e.g. < 500 bytes)
    if (fullBlob.size > 500) {
      try {
        const base64Audio = await blobToBase64(fullBlob);
        chrome.runtime.sendMessage({
          type: 'PROCESS_LIVE_CAPTION_AUDIO_CHUNK',
          payload: {
            tabId: targetTabId,
            base64Audio,
            mimeType,
          },
        });
      } catch (err) {
        console.error('[Shinkansen Offscreen] Failed to encode audio chunk:', err);
      }
    }

    // Schedule next chunk recording
    if (isCapturing) {
      recordChunkCycle(chunkDurationMs);
    }
  };

  activeRecorder.start();

  // Stop current recorder after chunkDurationMs to finalize valid WebM file
  recorderTimeout = setTimeout(() => {
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      try {
        activeRecorder.stop();
      } catch (_) {}
    }
  }, chunkDurationMs);
}

async function startCapture({ streamId, tabId, chunkDurationMs = 3800 }) {
  if (isCapturing) {
    stopCapture();
  }

  targetTabId = tabId;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    currentMediaStream = stream;

    // Connect to AudioContext.destination to maintain local playback audio
    currentAudioContext = new AudioContext();
    const source = currentAudioContext.createMediaStreamSource(stream);
    source.connect(currentAudioContext.destination);

    isCapturing = true;
    recordChunkCycle(chunkDurationMs);

    stream.getAudioTracks()[0].onended = () => {
      stopCapture();
    };

    return { ok: true };
  } catch (err) {
    console.error('[Shinkansen Offscreen] getUserMedia failed:', err);
    stopCapture();
    return { ok: false, error: err.message || String(err) };
  }
}

function stopCapture() {
  isCapturing = false;

  clearTimeout(recorderTimeout);
  recorderTimeout = null;

  if (activeRecorder && activeRecorder.state !== 'inactive') {
    try {
      activeRecorder.stop();
    } catch (_) {}
  }
  activeRecorder = null;

  if (currentAudioContext) {
    try {
      currentAudioContext.close();
    } catch (_) {}
    currentAudioContext = null;
  }

  if (currentMediaStream) {
    try {
      currentMediaStream.getTracks().forEach((track) => track.stop());
    } catch (_) {}
    currentMediaStream = null;
  }

  targetTabId = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_CAPTURE') {
    startCapture(message.payload).then((res) => sendResponse(res));
    return true;
  } else if (message.type === 'STOP_OFFSCREEN_CAPTURE') {
    stopCapture();
    sendResponse({ ok: true });
    return false;
  }
});
