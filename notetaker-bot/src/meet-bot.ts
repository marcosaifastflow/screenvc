import puppeteer, { type Browser, type Page } from 'puppeteer';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '..', 'extension');
const ADMIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function joinMeet(
  meetLink: string,
  botName: string,
): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    headless: false, // Required for tabCapture extension
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-extensions-except=' + EXTENSION_PATH,
      '--load-extension=' + EXTENSION_PATH,
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log(`[MEET] Navigating to ${meetLink}`);
  await page.goto(meetLink, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for the page to settle
  await page.waitForTimeout(3000);

  // Try to dismiss the "Got it" / cookie consent buttons
  try {
    const gotItButton = await page.$('button[aria-label="Got it"]');
    if (gotItButton) await gotItButton.click();
  } catch {}

  // Turn off camera and microphone before joining
  try {
    // Camera toggle
    const cameraBtn = await page.$('[data-is-muted][aria-label*="camera" i]');
    if (cameraBtn) {
      const isMuted = await cameraBtn.evaluate((el) => el.getAttribute('data-is-muted'));
      if (isMuted !== 'true') await cameraBtn.click();
    }

    // Mic toggle
    const micBtn = await page.$('[data-is-muted][aria-label*="microphone" i]');
    if (micBtn) {
      const isMuted = await micBtn.evaluate((el) => el.getAttribute('data-is-muted'));
      if (isMuted !== 'true') await micBtn.click();
    }
  } catch {}

  // Enter bot name
  try {
    const nameInput = await page.$('input[aria-label="Your name"]');
    if (nameInput) {
      await nameInput.click({ clickCount: 3 });
      await nameInput.type(botName, { delay: 50 });
    }
  } catch (err) {
    console.warn('[MEET] Could not set bot name:', err);
  }

  // Click "Ask to join" or "Join now" button
  console.log('[MEET] Clicking join button...');
  await page.waitForTimeout(1000);

  const joinClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const joinBtn = buttons.find(
      (b) =>
        b.textContent?.includes('Ask to join') ||
        b.textContent?.includes('Join now') ||
        b.textContent?.includes('Join'),
    );
    if (joinBtn) {
      joinBtn.click();
      return true;
    }
    return false;
  });

  if (!joinClicked) {
    throw new Error('Could not find join button on Google Meet page');
  }

  // Wait for admission (until we're in the meeting)
  console.log('[MEET] Waiting for host to admit...');
  await waitForAdmission(page);
  console.log('[MEET] Successfully joined the meeting');

  return { browser, page };
}

async function waitForAdmission(page: Page): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < ADMIT_TIMEOUT_MS) {
    // Check if we're in the meeting (participant list or meeting controls visible)
    const inMeeting = await page.evaluate(() => {
      // Meeting toolbar/controls appear when in the meeting
      const controls = document.querySelector('[data-call-controls]');
      // Or check for the leave button
      const leaveBtn = Array.from(document.querySelectorAll('button')).find(
        (b) =>
          b.getAttribute('aria-label')?.toLowerCase().includes('leave') ||
          b.textContent?.includes('Leave'),
      );
      // Or check for participant count
      const participantInfo = document.querySelector('[data-participant-id]');

      return !!(controls || leaveBtn || participantInfo);
    });

    if (inMeeting) return;

    // Check if we got denied
    const denied = await page.evaluate(() => {
      const body = document.body.innerText;
      return (
        body.includes('You can\'t join this video call') ||
        body.includes('The meeting host denied your request') ||
        body.includes('removed you from the meeting')
      );
    });

    if (denied) {
      throw new Error('Host denied admission to the meeting');
    }

    await page.waitForTimeout(2000);
  }

  throw new Error('Timed out waiting for host to admit bot (5 minutes)');
}
