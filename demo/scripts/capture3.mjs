import { launch, wait, clickInCard, clickButton, focusOn, shot, burst, readCard, BASE } from './lib.mjs';

const OUT = process.argv[2];
const CARD = 'serving a failing version';
const { browser, page } = await launch();
const go = async (r, s = 4500) => { await page.goto(BASE + r, { waitUntil: 'networkidle2', timeout: 90000 }); await wait(s); };
const log = (...a) => console.log(' ', ...a);

/** Refuses to act unless the card we are about to touch is provably the rollback plan. */
async function assertRollbackCard(stage) {
  const text = await readCard(page, [CARD, 'Roll the alias back', 'FunctionVersion'], 500);
  const ok = Boolean(text);
  log(`${stage} guard:`, ok ? 'card confirmed as the rollback plan' : `FAILED -> ${String(text).slice(0,120)}`);
  if (!ok) { await browser.close(); process.exit(2); }
}

await go('/remediation', 3500);
await focusOn(page, CARD); await wait(900);
await shot(page, `${OUT}/10-plan-rollback.png`);
await assertRollbackCard('pre-approve');

const approved = await clickInCard(page, CARD, 'Approve');
log('Approve ->', JSON.stringify(approved));
if (!approved.ok) { await browser.close(); process.exit(2); }
await wait(4500);
await focusOn(page, CARD); await wait(700);
await shot(page, `${OUT}/11-approved.png`);
await assertRollbackCard('pre-execute');

const executed = await clickInCard(page, CARD, 'Execute');
log('Execute ->', JSON.stringify(executed));
if (!executed.ok) { await browser.close(); process.exit(2); }
log('executing against AWS, capturing...');
await burst(page, `${OUT}/burst-exec`, 'ex', 18, 250);
await wait(2500);
await focusOn(page, CARD); await wait(900);
await shot(page, `${OUT}/12-verified.png`);
await page.evaluate(() => window.scrollBy(0, 300)); await wait(800);
await shot(page, `${OUT}/13-verification-checks.png`);
log('execute + verify captured');

/* reset, twice */
await go('/lab', 3500);
await shot(page, `${OUT}/14-lab-before-reset.png`);
log('Reset #1 ->', await clickButton(page, 'Reset lab'));
await burst(page, `${OUT}/burst-reset`, 'rs', 11, 250);
await wait(3000);
await shot(page, `${OUT}/15-reset-1.png`);
await go('/lab', 3000);                       // fresh page so the button is enabled again
log('Reset #2 ->', await clickButton(page, 'Reset lab'));
await wait(10000);
await shot(page, `${OUT}/16-reset-2.png`);
await page.evaluate(() => window.scrollTo(0, 520)); await wait(800);
await shot(page, `${OUT}/17-automation.png`);
log('reset captured');

await browser.close();
console.log('capture complete');
