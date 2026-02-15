// Background service worker for tab audio capture.
// Communicates with the Puppeteer page via chrome.runtime messaging.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_CAPTURE') {
    chrome.tabCapture.capture(
      { audio: true, video: false },
      (stream) => {
        if (chrome.runtime.lastError || !stream) {
          sendResponse({ error: chrome.runtime.lastError?.message || 'No stream' });
          return;
        }
        // Store stream globally so the content script can access it
        globalThis.__captureStream = stream;
        sendResponse({ success: true });
      },
    );
    return true; // keep channel open for async response
  }

  if (message.type === 'STOP_CAPTURE') {
    if (globalThis.__captureStream) {
      globalThis.__captureStream.getTracks().forEach((t) => t.stop());
      globalThis.__captureStream = null;
    }
    sendResponse({ success: true });
    return true;
  }
});
