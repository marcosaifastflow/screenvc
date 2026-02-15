import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { type Browser, type Page } from 'puppeteer';

puppeteerExtra.use(StealthPlugin());

const ADMIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const JOIN_RETRY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes of retrying to load join page

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function joinMeet(
  meetLink: string,
  botName: string,
): Promise<{ browser: Browser; page: Page }> {
  console.log('[MEET] Launching browser...');
  const browser = await puppeteerExtra.launch({
    headless: 'new' as any,
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

  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Retry loop: keep refreshing until we see the join page (host might not be in yet)
  const retryStart = Date.now();
  let attempt = 0;

  while (Date.now() - retryStart < JOIN_RETRY_TIMEOUT_MS) {
    attempt++;
    console.log(`[MEET] Attempt #${attempt}: Navigating to ${meetLink}`);
    await page.goto(meetLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(8000);

    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[MEET] Page loaded - Title: "${pageTitle}", URL: ${pageUrl}`);

    // Check what's on the page
    const pageState = await page.evaluate(() => {
      const body = document.body.innerText;
      const allButtons = Array.from(document.querySelectorAll('button'));
      const allInputs = Array.from(document.querySelectorAll('input'));

      const hasJoinButton = allButtons.some((b) => {
        const text = (b.textContent || '').toLowerCase();
        return text.includes('ask to join') || text.includes('join now') || text.includes('join meeting');
      });

      const hasNameInput = allInputs.some((i) => {
        const label = (i.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (i.placeholder || '').toLowerCase();
        return label.includes('name') || placeholder.includes('name');
      });

      const cantJoin = body.includes("You can't join this video call");
      const meetingEnded = body.includes('This meeting has ended');
      const notFound = body.includes('Meeting not found') || body.includes('Check your meeting code');

      return {
        hasJoinButton,
        hasNameInput,
        cantJoin,
        meetingEnded,
        notFound,
        bodySnippet: body.substring(0, 500),
        buttons: allButtons.map((b) => (b.textContent || '').trim().substring(0, 50)),
        inputs: allInputs.map((i) => i.getAttribute('aria-label') || i.placeholder || i.type),
      };
    });

    console.log(`[MEET] Page state:`, JSON.stringify(pageState, null, 2));

    // Fatal: meeting doesn't exist
    if (pageState.notFound) {
      await browser.close();
      throw new Error('Meeting not found — check the Meet link');
    }

    // Fatal: meeting already ended
    if (pageState.meetingEnded) {
      await browser.close();
      throw new Error('The meeting has already ended');
    }

    // Retryable: host not in meeting yet
    if (pageState.cantJoin) {
      console.log(`[MEET] Can't join yet (host not present). Retrying in 15 seconds...`);
      await delay(15000);
      continue;
    }

    // We have a join page — proceed
    if (pageState.hasJoinButton || pageState.hasNameInput) {
      console.log('[MEET] Join page detected, proceeding...');
      break;
    }

    // Unknown state — log and retry
    console.log('[MEET] Unknown page state, retrying in 10 seconds...');
    await delay(10000);
  }

  // If we exhausted retries
  const finalCheck = await page.evaluate(() => document.body.innerText.includes("You can't join"));
  if (finalCheck) {
    await browser.close();
    throw new Error('Could not join: host never joined the meeting (waited 3 minutes)');
  }

  // Dismiss cookie consent
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'got it' || text === 'accept all' || text === 'i agree' || text === 'dismiss') {
          btn.click();
        }
      }
    });
    await delay(1000);
  } catch {}

  // Enter bot name
  console.log('[MEET] Entering bot name...');
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
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set;
        if (setter) setter.call(input, name);
        else input.value = name;
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
  console.log('[MEET] Clicking join button...');
  const joinResult = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const joinTexts = ['ask to join', 'join now', 'join meeting', 'join', 'request to join'];

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      for (const joinText of joinTexts) {
        if (text.includes(joinText) || ariaLabel.includes(joinText)) {
          (btn as HTMLElement).click();
          return { clicked: true, text: text.substring(0, 50) };
        }
      }
    }
    return { clicked: false, text: '' };
  });

  console.log('[MEET] Join button result:', JSON.stringify(joinResult));

  if (!joinResult.clicked) {
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('[MEET] Page body when join failed:', bodyText);
    await browser.close();
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

      if (body.includes('The meeting host denied your request') ||
          body.includes('removed you from the meeting')) {
        return { status: 'denied' as const, bodySnippet };
      }

      const controls = document.querySelector('[data-call-controls]');
      const leaveBtn = Array.from(document.querySelectorAll('button')).find(
        (b: HTMLButtonElement) =>
          b.getAttribute('aria-label')?.toLowerCase().includes('leave') ||
          b.textContent?.toLowerCase().includes('leave call'),
      );
      const participantInfo = document.querySelector('[data-participant-id]');

      if (controls || leaveBtn || participantInfo) {
        return { status: 'joined' as const, bodySnippet };
      }

      return { status: 'waiting' as const, bodySnippet };
    });

    if (checkCount <= 3 || checkCount % 5 === 0) {
      console.log(`[MEET] Admission check #${checkCount}: ${result.status}`);
      console.log(`[MEET] Body: ${result.bodySnippet.substring(0, 200)}`);
    }

    if (result.status === 'joined') return;
    if (result.status === 'denied') throw new Error('Host denied admission to the meeting');

    await delay(2000);
  }

  throw new Error('Timed out waiting for host to admit bot (5 minutes)');
}
