import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUT_DIR = '/tmp/paybacker-banners';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const AMBER = '#f59e0b';
const SLATE = '#0f172a';
const SLATE2 = '#1e293b';
const WHITE = '#ffffff';
const SLATE_TEXT = '#94a3b8';

const banners = [
  {
    file: 'leaderboard-728x90.html',
    width: 728, height: 90,
    html: `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 24px;width:728px;height:90px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;border:1px solid #1e293b">
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:22px;font-weight:800;color:${WHITE}">Pay<span style="color:${AMBER}">backer</span></span>
    <span style="width:1px;height:32px;background:#334155"></span>
    <span style="font-size:13px;color:${SLATE_TEXT};max-width:280px;line-height:1.3">AI that cancels subscriptions, disputes bills &amp; finds better deals</span>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <span style="font-size:12px;color:${SLATE_TEXT}">Free to join · UK consumers</span>
    <a style="background:${AMBER};color:${SLATE};font-weight:700;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;white-space:nowrap">Get Started Free</a>
  </div>
</div>`
  },
  {
    file: 'leaderboard-728x90-v2.html',
    width: 728, height: 90,
    html: `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 24px;width:728px;height:90px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;border:1px solid #1e293b">
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:22px;font-weight:800;color:${WHITE}">Pay<span style="color:${AMBER}">backer</span></span>
    <span style="width:1px;height:32px;background:#334155"></span>
    <span style="font-size:20px;font-weight:700;color:${AMBER}">£312</span>
    <span style="font-size:13px;color:${SLATE_TEXT}">wasted every year on forgotten subscriptions</span>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <span style="font-size:12px;color:${SLATE_TEXT}">AI finds them in seconds</span>
    <a style="background:${AMBER};color:${SLATE};font-weight:700;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;white-space:nowrap">Find Mine Free</a>
  </div>
</div>`
  },
  {
    file: 'medium-rectangle-300x250.html',
    width: 300, height: 250,
    html: `<div style="width:300px;height:250px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;padding:28px 24px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #1e293b">
  <div>
    <div style="font-size:20px;font-weight:800;color:${WHITE};margin-bottom:6px">Pay<span style="color:${AMBER}">backer</span></div>
    <div style="font-size:14px;font-weight:700;color:${WHITE};line-height:1.4;margin-bottom:10px">Cancel forgotten subscriptions.<br>Dispute unfair bills.<br>Find better deals.</div>
    <div style="font-size:12px;color:${SLATE_TEXT};line-height:1.5">AI-powered money assistant for UK consumers. Cites Consumer Rights Act 2015.</div>
  </div>
  <div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
      <div style="font-size:12px;color:${SLATE_TEXT}">✓ Free to join · no card required</div>
      <div style="font-size:12px;color:${SLATE_TEXT}">✓ Open Banking powered</div>
      <div style="font-size:12px;color:${SLATE_TEXT}">✓ UK consumer law trained</div>
    </div>
    <a style="display:block;text-align:center;background:${AMBER};color:${SLATE};font-weight:700;font-size:14px;padding:12px;border-radius:8px;text-decoration:none">Get Started Free</a>
  </div>
</div>`
  },
  {
    file: 'medium-rectangle-300x250-v2.html',
    width: 300, height: 250,
    html: `<div style="width:300px;height:250px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;padding:24px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #1e293b">
  <div>
    <div style="font-size:20px;font-weight:800;color:${WHITE};margin-bottom:14px">Pay<span style="color:${AMBER}">backer</span></div>
    <div style="font-size:36px;font-weight:800;color:${AMBER};line-height:1">£312</div>
    <div style="font-size:13px;color:${WHITE};font-weight:600;margin-top:4px">wasted every year on subscriptions you have forgotten about</div>
    <div style="font-size:12px;color:${SLATE_TEXT};margin-top:8px">Our AI scans your bank account and finds every one.</div>
  </div>
  <a style="display:block;text-align:center;background:${AMBER};color:${SLATE};font-weight:700;font-size:14px;padding:12px;border-radius:8px;text-decoration:none">Find Mine Free</a>
</div>`
  },
  {
    file: 'wide-skyscraper-160x600.html',
    width: 160, height: 600,
    html: `<div style="width:160px;height:600px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;padding:28px 16px;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;border:1px solid #1e293b">
  <div>
    <div style="font-size:18px;font-weight:800;color:${WHITE};margin-bottom:20px">Pay<span style="color:${AMBER}">backer</span></div>
    <div style="font-size:13px;font-weight:700;color:${WHITE};line-height:1.5;margin-bottom:12px">Your AI-Powered Money Assistant</div>
    <div style="width:40px;height:2px;background:${AMBER};margin:0 auto 16px"></div>
    <div style="font-size:11px;color:${SLATE_TEXT};line-height:1.6;margin-bottom:20px">Cancel forgotten subscriptions. Dispute unfair bills. Find better deals.</div>
  </div>
  <div style="width:100%">
    <div style="background:${SLATE2};border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-size:22px;font-weight:800;color:${AMBER}">£312</div>
      <div style="font-size:10px;color:${SLATE_TEXT};margin-top:2px">avg wasted per year on forgotten subs</div>
    </div>
    <div style="background:${SLATE2};border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-size:12px;color:${WHITE};font-weight:600">UK Consumer Law</div>
      <div style="font-size:10px;color:${SLATE_TEXT};margin-top:2px">Every complaint letter cites exact legislation</div>
    </div>
    <div style="background:${SLATE2};border-radius:8px;padding:12px;margin-bottom:20px">
      <div style="font-size:12px;color:${WHITE};font-weight:600">Open Banking</div>
      <div style="font-size:10px;color:${SLATE_TEXT};margin-top:2px">Finds every subscription automatically</div>
    </div>
    <a style="display:block;text-align:center;background:${AMBER};color:${SLATE};font-weight:700;font-size:12px;padding:12px 8px;border-radius:8px;text-decoration:none">Get Started Free</a>
    <div style="font-size:10px;color:${SLATE_TEXT};margin-top:8px">No card required</div>
  </div>
</div>`
  },
  {
    file: 'half-page-300x600.html',
    width: 300, height: 600,
    html: `<div style="width:300px;height:600px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;padding:36px 28px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #1e293b">
  <div>
    <div style="font-size:24px;font-weight:800;color:${WHITE};margin-bottom:4px">Pay<span style="color:${AMBER}">backer</span></div>
    <div style="font-size:11px;color:${SLATE_TEXT};margin-bottom:24px;text-transform:uppercase;letter-spacing:1px">AI-Powered Money Assistant</div>
    <div style="font-size:17px;font-weight:700;color:${WHITE};line-height:1.4;margin-bottom:20px">Stop overpaying.<br>Start recovering.</div>
    <div style="font-size:13px;color:${SLATE_TEXT};line-height:1.6;margin-bottom:28px">Our AI scans your bank and inbox to find wasted subscriptions, overcharges, and better deals — then takes action using UK consumer law.</div>
  </div>
  <div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">
      <div style="background:${SLATE2};border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:${AMBER}">£312</div>
        <div style="font-size:10px;color:${SLATE_TEXT};margin-top:3px;line-height:1.3">avg wasted on forgotten subs/year</div>
      </div>
      <div style="background:${SLATE2};border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:${AMBER}">30s</div>
        <div style="font-size:10px;color:${SLATE_TEXT};margin-top:3px;line-height:1.3">to generate a legal complaint letter</div>
      </div>
      <div style="background:${SLATE2};border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:${AMBER}">£520</div>
        <div style="font-size:10px;color:${SLATE_TEXT};margin-top:3px;line-height:1.3">flight delay compensation you could claim</div>
      </div>
      <div style="background:${SLATE2};border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:${AMBER}">Free</div>
        <div style="font-size:10px;color:${SLATE_TEXT};margin-top:3px;line-height:1.3">to join — no card required</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:20px">
      <div style="font-size:12px;color:${SLATE_TEXT}">✓ Cites Consumer Rights Act 2015</div>
      <div style="font-size:12px;color:${SLATE_TEXT}">✓ Open Banking powered</div>
      <div style="font-size:12px;color:${SLATE_TEXT}">✓ GDPR compliant · UK only</div>
    </div>
    <a style="display:block;text-align:center;background:${AMBER};color:${SLATE};font-weight:700;font-size:15px;padding:14px;border-radius:8px;text-decoration:none">Get Started Free</a>
  </div>
</div>`
  },
  {
    file: 'full-banner-468x60.html',
    width: 468, height: 60,
    html: `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px;width:468px;height:60px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;border:1px solid #1e293b">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-size:18px;font-weight:800;color:${WHITE}">Pay<span style="color:${AMBER}">backer</span></span>
    <span style="font-size:12px;color:${SLATE_TEXT}">AI that finds your wasted subscriptions &amp; disputes your bills</span>
  </div>
  <a style="background:${AMBER};color:${SLATE};font-weight:700;font-size:12px;padding:8px 16px;border-radius:6px;text-decoration:none;white-space:nowrap">Free →</a>
</div>`
  },
  {
    file: 'mobile-banner-320x50.html',
    width: 320, height: 50,
    html: `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 14px;width:320px;height:50px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;border:1px solid #1e293b">
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:16px;font-weight:800;color:${WHITE}">Pay<span style="color:${AMBER}">backer</span></span>
    <span style="font-size:11px;color:${SLATE_TEXT}">Cancel subs · Dispute bills · Save money</span>
  </div>
  <a style="background:${AMBER};color:${SLATE};font-weight:700;font-size:11px;padding:7px 12px;border-radius:5px;text-decoration:none;white-space:nowrap">Free</a>
</div>`
  },
  {
    file: 'mobile-large-320x100.html',
    width: 320, height: 100,
    html: `<div style="width:320px;height:100px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;padding:14px 16px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #1e293b">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:18px;font-weight:800;color:${WHITE}">Pay<span style="color:${AMBER}">backer</span></span>
    <span style="font-size:11px;color:${SLATE_TEXT}">Free to join · UK only</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:12px;color:${SLATE_TEXT};max-width:210px;line-height:1.4">AI that cancels forgotten subscriptions &amp; disputes unfair bills</span>
    <a style="background:${AMBER};color:${SLATE};font-weight:700;font-size:12px;padding:9px 14px;border-radius:6px;text-decoration:none;white-space:nowrap">Start Free</a>
  </div>
</div>`
  },
  {
    file: 'square-250x250.html',
    width: 250, height: 250,
    html: `<div style="width:250px;height:250px;background:${SLATE};font-family:system-ui,sans-serif;box-sizing:border-box;padding:24px 20px;display:flex;flex-direction:column;justify-content:space-between;text-align:center;align-items:center;border:1px solid #1e293b">
  <div>
    <div style="font-size:18px;font-weight:800;color:${WHITE};margin-bottom:14px">Pay<span style="color:${AMBER}">backer</span></div>
    <div style="font-size:13px;font-weight:700;color:${WHITE};line-height:1.4;margin-bottom:8px">Your AI-Powered Money Assistant</div>
    <div style="font-size:11px;color:${SLATE_TEXT};line-height:1.5">Cancel subs · Dispute bills · Find better deals on energy &amp; broadband</div>
  </div>
  <div style="width:100%">
    <div style="font-size:32px;font-weight:800;color:${AMBER};margin-bottom:4px">£312</div>
    <div style="font-size:10px;color:${SLATE_TEXT};margin-bottom:16px">average wasted on forgotten subscriptions/year</div>
    <a style="display:block;background:${AMBER};color:${SLATE};font-weight:700;font-size:13px;padding:11px;border-radius:7px;text-decoration:none">Get Started Free</a>
  </div>
</div>`
  },
];

// Wrap each banner in a full HTML document
banners.forEach(({ file, width, height, html }) => {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #0f172a; }
</style>
</head>
<body>${html}</body>
</html>`;
  fs.writeFileSync(path.join(OUT_DIR, file), fullHtml);
  console.log(`Created: ${file}`);
});

console.log(`\nAll ${banners.length} banners created in ${OUT_DIR}`);

// Create zip
execSync(`cd /tmp && zip -r paybacker-banners.zip paybacker-banners/`);
console.log('Zip created: /tmp/paybacker-banners.zip');

// Read zip and send via Resend
const zipBuffer = fs.readFileSync('/tmp/paybacker-banners.zip');
const zipBase64 = zipBuffer.toString('base64');

const payload = {
  from: 'Paybacker <hello@paybacker.co.uk>',
  to: 'hello@paybacker.co.uk',
  subject: 'Paybacker — Awin Banner Creative (All Sizes)',
  text: `Paybacker Awin Banners\n\nAttached is a zip file containing ${banners.length} HTML5 banner files ready to upload to Awin via Toolbox > My Creative.\n\nBanners included:\n${banners.map(b => `- ${b.file} (${b.width}x${b.height})`).join('\n')}\n\nAll banners are HTML5 format. When uploading to Awin, select HTML5 as the creative type. Each file is self-contained and ready to use.\n\nColours used:\n- Background: #0f172a (deep slate)\n- Accent: #f59e0b (amber)\n- Text: #ffffff / #94a3b8\n\nThe Paybacker Team`,
  attachments: [
    {
      filename: 'paybacker-banners.zip',
      content: zipBase64,
    }
  ]
};

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer re_PvKwSiiJ_3mXowp2hwBHYuwyfv53awYb5',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const data = await res.json();
console.log('Email sent:', JSON.stringify(data));
