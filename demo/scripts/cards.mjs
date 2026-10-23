import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

// The project's own tokens, so the cards and the app look like one thing.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Lora:ital@1&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;background:#0c161c;color:#e4eef3;
  font-family:Poppins,system-ui,sans-serif;display:grid;place-items:center;overflow:hidden}
.wrap{text-align:center;max-width:1500px;padding:0 80px}
.eyebrow{font-family:Lora,Georgia,serif;font-style:italic;font-size:34px;color:#8fc0dc;
  letter-spacing:.02em;margin-bottom:28px;display:inline-block;
  border-bottom:1px solid rgba(143,192,220,.45);padding-bottom:14px}
h1{font-size:88px;font-weight:600;line-height:1.04;letter-spacing:-.022em;text-wrap:balance}
h1 .dim{color:#9db5c1}
p.sub{font-size:40px;color:#9db5c1;margin-top:34px;line-height:1.4;font-weight:500}
.quote{font-size:46px;line-height:1.35;color:#e4eef3;font-weight:500;
  border-left:4px solid #8fc0dc;padding-left:40px;text-align:left;margin-top:12px}
.src{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;color:#71909e;
  margin-top:26px;text-align:left;padding-left:44px}
ul{list-style:none;text-align:left;margin-top:40px;display:inline-block}
li{font-size:40px;color:#c8dbe4;margin:18px 0;font-weight:500}
li b{color:#8fc0dc;font-family:ui-monospace,Menlo,monospace;font-size:36px}
.checks li::before{content:"✓";color:#46bf8b;font-weight:700;margin-right:22px}
.brand{font-size:104px;font-weight:700;letter-spacing:-.03em}
.loop{font-size:36px;color:#8fc0dc;margin-top:40px;font-weight:500;letter-spacing:.01em}
.repo{font-family:ui-monospace,Menlo,monospace;font-size:30px;color:#71909e;margin-top:46px}
`;

const CARDS = {
  'c1-problem': `<div class="wrap">
      <span class="eyebrow">Live AWS environment · us-east-1</span>
      <h1>Production-like cloud<br/>environments fail.</h1>
      <p class="sub">Can an AI agent diagnose and safely fix the problem?</p></div>`,
  'c2-detect': `<div class="wrap">
      <span class="eyebrow">Detect</span>
      <h1>Detect failures using<br/>real AWS evidence.</h1>
      <ul><li>Invocations <b>13</b> · Errors <b>10</b> · <b>76.9%</b></li>
          <li>Alias <b>live</b> → version <b>2</b></li>
          <li>Known-good version <b>1</b> from the baseline</li></ul></div>`,
  'c3-analyze': `<div class="wrap">
      <span class="eyebrow">Analyze · Amazon Bedrock</span>
      <h1>Grounded diagnosis.<br/><span class="dim">No invented evidence.</span></h1></div>`,
  'c3b-quote': `<div class="wrap">
      <span class="eyebrow">Amazon Bedrock · us.amazon.nova-pro-v1:0</span>
      <p class="quote">"The alias 'live' is pointing to version 2, which is failing,
         instead of the known-good version 1."</p>
      <p class="src">grounding: 5 of 5 findings verified · 0 rejected</p></div>`,
  'c4-plan': `<div class="wrap">
      <span class="eyebrow">Plan &amp; approve</span>
      <h1>Plan first.<br/>Human approval required.</h1>
      <p class="sub">No mutation before approval.</p></div>`,
  'c5-execute': `<div class="wrap">
      <span class="eyebrow">Execute</span>
      <h1>Scoped action.<br/>Concurrency protected.</h1>
      <ul><li><b>lambda:UpdateAlias</b> · version <b>2 → 1</b></li>
          <li>conditional on the observed <b>RevisionId</b></li></ul></div>`,
  'c6-verify': `<div class="wrap">
      <span class="eyebrow">Verify</span>
      <h1>A changed configuration<br/>is not enough.</h1>
      <ul class="checks"><li>configuration-readback</li>
          <li>detector-rerun</li>
          <li>behaviour-probe — the alias actually answers</li></ul></div>`,
  'c7-reset': `<div class="wrap">
      <span class="eyebrow">Reset</span>
      <h1>Repeatable experiments.<br/>Idempotent reset.</h1>
      <p class="sub">The second reset makes no AWS call at all.</p></div>`,
  'c8-close': `<div class="wrap">
      <p class="brand">AI Cloud Operations Engineer</p>
      <p class="loop">Detect → Diagnose → Plan → Approve → Remediate → Verify</p>
      <p class="sub" style="margin-top:46px">Building safer AI-powered cloud operations.</p>
      <p class="repo">github.com/TanseerS/AI-Cloud-Operations-Engineer</p></div>`,
};

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
for (const [name, html] of Object.entries(CARDS)) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${html}`,
                        { waitUntil: 'domcontentloaded', timeout: 20000 });
  // Wait for the webfonts specifically rather than for the network to go quiet.
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ', name);
}
await browser.close();
