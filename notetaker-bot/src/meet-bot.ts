import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { type Browser, type Page } from 'puppeteer';

puppeteerExtra.use(StealthPlugin());

const ADMIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function joinMeet(
  meetLink: string,
  botName: string,
): Promise<{ browser: Browser; page: Page }> {
  console.log('[MEET] Launching browser...');
  const browser = await puppeteerExtra.launch({
    headless: 'new' as any, // New headless mode - full browser engine, no display needed
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720',
      '--disable-blink-features=AutomationControlled',
      '--single-process',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  }) as unknown as Browser;
  console.log('[MEET] Browser launched successfully');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Set a realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  );

  // Remove webdriver flag
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log(`[MEET] Navigating to ${meetLink}`);
  await page.goto(meetLink, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the page to fully render
  await delay(8000);

  // Log page state for debugging
  const pageTitle = await page.title();
  const pageUrl = page.url();
  console.log(`[MEET] Page loaded - Title: "${pageTitle}", URL: ${pageUrl}`);

  const pageDebug = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    const allInputs = Array.from(document.querySelectorAll('input'));
    const bodyText = document.body.innerText.substring(0, 1000);
    return {
      buttons: allButtons.map((b) => ({
        text: b.textContent?.trim().substring(0, 50),
        ariaLabel: b.getAttribute('aria-label'),
      })),
      inputs: allInputs.map((i) => ({
        type: i.type,
        ariaLabel: i.getAttribute('aria-label'),
        placeholder: i.placeholder,
      })),
      bodyText,
    };
  });
  console.log('[MEET] Page debug:', JSON.stringify(pageDebug, null, 2));

  // Dismiss cookie consent / "Got it" buttons
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (
          text === 'got it' ||
          text === 'accept all' ||
          text === 'i agree' ||
          text === 'dismiss'
        ) {
          btn.click();
        }
      }
    });
    await delay(1000);
  } catch {}

  // Enter bot name
  console.log('[MEET] Looking for name input...');
  const nameEntered = await page.evaluate((name: string) => {
    const selectors = [
      'input[aria-label="Your name"]',
      'input[aria-label="Your Name"]',
      'input[placeholder*="name" i]',
      'input[type="text"]',
    ];
    for (const selector of selectors) {
      const input = document.querySelector(selector) as HTMLInputElement;
      if (input) {
        input.value = '';
        input.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, name);
        } else {
          input.value = name;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { found: true, selector };
      }
    }
    return { found: false, selector: null };
  }, botName);
  console.log('[MEET] Name input result:', JSON.stringify(nameEntered));

  await delay(2000);

  // Click join button
  console.log('[MEET] Looking for join button...');
  const joinResult = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const joinTexts = [
      'ask to join',
      'join now',
      'join meeting',
      'join',
      'request to join',
    ];

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

      for (const joinText of joinTexts) {
        if (text.includes(joinText) || ariaLabel.includes(joinText)) {
          (btn as HTMLElement).click();
          return { clicked: true, text: text.substring(0, 50), method: 'text-match' };
        }
      }
    }

    return { clicked: false, text: '', method: 'none' };
  });

  console.log('[MEET] Join button result:', JSON.stringify(joinResult));

  if (!joinResult.clicked) {
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('[MEET] Page body when join failed:', bodyText);
    throw new Error('Could not find join button on Google Meet page');
  }

  // Wait for admission
  console.log('[MEET] Waiting for host to admit...');
  await waitForAdmission(page);
  console.log('[MEET] Successfully joined the meeting');

  return { browser, page };
}

async function waitForAdmission(page: Page): Promise<void> {
  const startTime = Date.now();
  let checkCount = 0;

  while (Date.now() - startTime < ADMIT_TIMEOUT_MS) {
    checkCount++;

    const result = await page.evaluate(() => {
      const body = document.body.innerText;
      const bodySnippet = body.substring(0, 500);

      // Only fail on explicit host denial
      const deniedStrings = [
        'The meeting host denied your request',
        'removed you from the meeting',
      ];
      for (const s of deniedStrings) {
        if (body.includes(s)) {
          return { status: 'denied', reason: s, bodySnippet };
        }
      }

      // Meeting unavailable — but give time for it to load
      const unavailableStrings = [
        "You can't join this video call",
        'Meeting not found',
        'Check your meeting code',
        'Invalid meeting code',
      ];
      for (const s of unavailableStrings) {
        if (body.includes(s)) {
          return { status: 'unavailable', reason: s, bodySnippet };
        }
      }

      // Check if in meeting
      const controls = document.querySelector('[data-call-controls]');
      const leaveBtn = Array.from(document.querySelectorAll('button')).find(
        (b: HTMLButtonElement) =>
          b.getAttribute('aria-label')?.toLowerCase().includes('leave') ||
          b.textContent?.toLowerCase().includes('leave call'),
      );
      const participantInfo = document.querySelector('[data-participant-id]');
      const toolbar = document.querySelector('[jscontroller][jsaction*="leave"]');

      if (controls || leaveBtn || participantInfo || toolbar) {
        return { status: 'joined', reason: '', bodySnippet };
      }

      return { status: 'waiting', reason: '', bodySnippet };
    });

    if (checkCount <= 3 || checkCount % 5 === 0) {
      console.log(`[MEET] Check #${checkCount}: status=${result.status}, reason="${result.reason}"`);
      console.log(`[MEET] Body snippet: ${result.bodySnippet}`);
    }

    if (result.status === 'joined') {
      console.log('[MEET] Admission confirmed - now in meeting');
      return;
    }

    if (result.status === 'denied') {
      throw new Error(`Host denied admission: ${result.reason}`);
    }

    // Only fail on "unavailable" after 10 checks (20 seconds)
    if (result.status === 'unavailable' && checkCount > 10) {
      throw new Error(`Meeting unavailable: ${result.reason}`);
    }

    await delay(2000);
  }

  throw new Error('Timed out waiting for host to admit bot (5 minutes)');
}
