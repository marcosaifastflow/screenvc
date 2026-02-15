import puppeteer, { type Browser, type Page } from 'puppeteer';

const ADMIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function joinMeet(
  meetLink: string,
  botName: string,
): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    headless: true,
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
      '--disable-web-security',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Set a realistic user agent so Google Meet doesn't block us
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  );

  console.log(`[MEET] Navigating to ${meetLink}`);
  await page.goto(meetLink, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Log the page title and URL for debugging
  const pageTitle = await page.title();
  const pageUrl = page.url();
  console.log(`[MEET] Page loaded - Title: "${pageTitle}", URL: ${pageUrl}`);

  // Wait for the page to settle
  await delay(5000);

  // Log what's on the page for debugging
  const pageDebug = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    const allInputs = Array.from(document.querySelectorAll('input'));
    const allLinks = Array.from(document.querySelectorAll('a'));
    const bodyText = document.body.innerText.substring(0, 1000);
    return {
      buttons: allButtons.map((b) => ({
        text: b.textContent?.trim().substring(0, 50),
        ariaLabel: b.getAttribute('aria-label'),
        dataIsMuted: b.getAttribute('data-is-muted'),
      })),
      inputs: allInputs.map((i) => ({
        type: i.type,
        ariaLabel: i.getAttribute('aria-label'),
        placeholder: i.placeholder,
        name: i.name,
      })),
      linkCount: allLinks.length,
      bodyText,
    };
  });
  console.log('[MEET] Page debug:', JSON.stringify(pageDebug, null, 2));

  // Try to dismiss cookie consent / "Got it" buttons
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

  // Enter bot name - try multiple possible selectors
  console.log('[MEET] Looking for name input...');
  const nameEntered = await page.evaluate((name: string) => {
    // Try various selectors for the name input
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
        // Use native input setter to trigger React/Angular change detection
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

  // Wait a moment after entering name
  await delay(2000);

  // Click join button - try multiple strategies
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
      const jsName = (btn.getAttribute('jsname') || '').toLowerCase();

      for (const joinText of joinTexts) {
        if (text.includes(joinText) || ariaLabel.includes(joinText)) {
          (btn as HTMLElement).click();
          return { clicked: true, text: text.substring(0, 50), method: 'text-match' };
        }
      }

      // Google Meet sometimes uses data-mdc attributes or specific jsnames
      if (jsName === 'wg1ovc' || jsName === 'a4fub') {
        (btn as HTMLElement).click();
        return { clicked: true, text: text.substring(0, 50), method: 'jsname-match' };
      }
    }

    // Last resort: look for any prominent button that could be "join"
    const allBtns = Array.from(document.querySelectorAll('button'));
    const prominentBtn = allBtns.find((b) => {
      const style = window.getComputedStyle(b);
      const text = (b.textContent || '').trim().toLowerCase();
      // Look for a button that contains "join" anywhere or is a primary-looking button
      return (
        text.includes('join') ||
        (style.backgroundColor && text.length > 0 && text.length < 20)
      );
    });

    if (prominentBtn) {
      prominentBtn.click();
      return {
        clicked: true,
        text: (prominentBtn.textContent || '').trim().substring(0, 50),
        method: 'prominent-btn',
      };
    }

    return { clicked: false, text: '', method: 'none' };
  });

  console.log('[MEET] Join button result:', JSON.stringify(joinResult));

  if (!joinResult.clicked) {
    // Take a screenshot for debugging before failing
    const pageContent = await page.content();
    console.log('[MEET] Page HTML (first 2000 chars):', pageContent.substring(0, 2000));
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
    const status = await page.evaluate(() => {
      const body = document.body.innerText;

      // Check if denied
      if (
        body.includes("You can't join this video call") ||
        body.includes('The meeting host denied your request') ||
        body.includes('removed you from the meeting') ||
        body.includes('This meeting has ended') ||
        body.includes('Meeting not found')
      ) {
        return 'denied';
      }

      // Check if in meeting
      const controls = document.querySelector('[data-call-controls]');
      const leaveBtn = Array.from(document.querySelectorAll('button')).find(
        (b: HTMLButtonElement) =>
          b.getAttribute('aria-label')?.toLowerCase().includes('leave') ||
          b.textContent?.toLowerCase().includes('leave call'),
      );
      const participantInfo = document.querySelector('[data-participant-id]');
      // Check for the bottom toolbar that appears when in a call
      const toolbar = document.querySelector('[jscontroller][jsaction*="leave"]');

      if (controls || leaveBtn || participantInfo || toolbar) {
        return 'joined';
      }

      return 'waiting';
    });

    if (status === 'joined') {
      console.log('[MEET] Admission confirmed - now in meeting');
      return;
    }

    if (status === 'denied') {
      throw new Error('Host denied admission to the meeting');
    }

    await delay(2000);
  }

  throw new Error('Timed out waiting for host to admit bot (5 minutes)');
}
