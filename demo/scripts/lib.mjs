import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'https://ai.tanseer.qd.je';
export const FPS = 30;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  return { browser, page };
}

/**
 * Clicks a button inside the card that mentions `cardText`.
 *
 * Scoping matters more than it looks: the remediation page lists several plans, each
 * with its own "Approve fix" button. Matching on button text alone picks the first one
 * on the page, which is how an earlier run approved and executed the wrong remediation.
 */
export async function clickInCard(page, cardText, buttonText) {
  return page.evaluate((cardT, btnT) => {
    // Find the button whose SMALLEST common ancestor with the card text is smallest.
    //
    // Walking up from the text and taking the first ancestor that happens to contain a
    // matching button is wrong: once the walk leaves the real card it reaches the list
    // container, whose first matching button belongs to a different plan. That mistake
    // approved and executed the wrong remediation twice.
    const buttons = [...document.querySelectorAll('button')]
      .filter((b) => b.textContent.trim().toLowerCase().includes(btnT.toLowerCase()) && !b.disabled);
    if (buttons.length === 0) return { ok: false, reason: 'no enabled button with that label' };

    let best = null;
    for (const btn of buttons) {
      let node = btn;
      let depth = 0;
      while (node && node !== document.body) {
        if (node.textContent.includes(cardT)) {
          // Size of the shared container, as a proxy for "same card".
          const size = node.textContent.length;
          if (!best || size < best.size) best = { btn, size, depth };
          break;
        }
        node = node.parentElement;
        depth += 1;
      }
    }
    if (!best) return { ok: false, reason: 'no button shares a container with the card text' };

    // Guard: the shared container must look like one card, not the whole list. A plan
    // card is a few hundred characters; the list is thousands.
    if (best.size > 2500) return { ok: false, reason: `shared container too large (${best.size} chars) - refusing to click` };

    best.btn.scrollIntoView({ block: 'center' });
    best.btn.click();
    return { ok: true, size: best.size };
  }, cardText, buttonText);
}

/**
 * Reads back the smallest container holding every one of `must` - the same container
 * clickInCard resolves, so a guard written against this text is a guard on the element
 * that will actually be clicked.
 */
export async function readCard(page, must, max = 600) {
  return page.evaluate((needles, m) => {
    const el = [...document.querySelectorAll('article,li,section,div')]
      .filter((e) => needles.every((n) => e.textContent.includes(n)))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    return el ? el.textContent.replace(/\s+/g, ' ').slice(0, m) : null;
  }, Array.isArray(must) ? must : [must], max);
}

export async function clickButton(page, text) {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => x.textContent.trim().toLowerCase().includes(t.toLowerCase()) && !x.disabled);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' }); b.click(); return true;
  }, text);
}

/** Scrolls so the element containing `text` sits nicely in frame. */
export async function focusOn(page, text, offset = 140) {
  return page.evaluate((t, off) => {
    const el = [...document.querySelectorAll('h2,h3,p,span,div,article')]
      .filter((e) => e.textContent.includes(t))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!el) return false;
    const y = el.getBoundingClientRect().top + window.scrollY - off;
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    return true;
  }, text, offset);
}

export async function shot(page, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

/** A burst of stills while something is genuinely happening, for real motion. */
export async function burst(page, dir, name, seconds, everyMs = 100) {
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round((seconds * 1000) / everyMs);
  for (let i = 0; i < n; i++) {
    await page.screenshot({ path: path.join(dir, `${name}-${String(i).padStart(4, '0')}.png`) });
    await wait(everyMs);
  }
  return n;
}
