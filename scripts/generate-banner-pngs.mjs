import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUT_DIR = '/tmp/paybacker-banner-pngs';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Colours
const SLATE = '#0f172a';
const AMBER = '#f59e0b';
const WHITE = '#ffffff';
const SLATE_TEXT = '#94a3b8';
const BORDER = '#1e293b';

// Helper: build SVG for each banner
const banners = [
  {
    file: 'leaderboard-728x90-v1.png',
    w: 728, h: 90,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="4"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="4"/>
      <!-- Logo -->
      <text x="24" y="57" font-size="22" font-weight="800" fill="${WHITE}">Pay</text>
      <text x="64" y="57" font-size="22" font-weight="800" fill="${AMBER}">backer</text>
      <!-- Divider -->
      <line x1="158" y1="29" x2="158" y2="61" stroke="#334155" stroke-width="1"/>
      <!-- Tagline -->
      <text x="170" y="43" font-size="12" fill="${SLATE_TEXT}">AI that cancels subscriptions, disputes bills</text>
      <text x="170" y="59" font-size="12" fill="${SLATE_TEXT}">and finds better deals — free to join</text>
      <!-- Sub label -->
      <text x="490" y="50" font-size="12" fill="${SLATE_TEXT}" text-anchor="middle">Free · UK consumers</text>
      <!-- CTA button -->
      <rect x="578" y="28" width="128" height="34" fill="${AMBER}" rx="6"/>
      <text x="642" y="50" font-size="13" font-weight="700" fill="${SLATE}" text-anchor="middle">Get Started Free</text>
    </svg>`
  },
  {
    file: 'leaderboard-728x90-v2.png',
    w: 728, h: 90,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="4"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="4"/>
      <text x="24" y="57" font-size="22" font-weight="800" fill="${WHITE}">Pay</text>
      <text x="64" y="57" font-size="22" font-weight="800" fill="${AMBER}">backer</text>
      <line x1="158" y1="29" x2="158" y2="61" stroke="#334155" stroke-width="1"/>
      <text x="172" y="48" font-size="20" font-weight="700" fill="${AMBER}">£312</text>
      <text x="216" y="43" font-size="12" fill="${SLATE_TEXT}">wasted every year on</text>
      <text x="216" y="59" font-size="12" fill="${SLATE_TEXT}">forgotten subscriptions</text>
      <text x="490" y="50" font-size="12" fill="${SLATE_TEXT}" text-anchor="middle">AI finds them in seconds</text>
      <rect x="584" y="28" width="122" height="34" fill="${AMBER}" rx="6"/>
      <text x="645" y="50" font-size="13" font-weight="700" fill="${SLATE}" text-anchor="middle">Find Mine Free</text>
    </svg>`
  },
  {
    file: 'medium-rectangle-300x250-v1.png',
    w: 300, h: 250,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="6"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="6"/>
      <text x="24" y="54" font-size="24" font-weight="800" fill="${WHITE}">Pay</text>
      <text x="68" y="54" font-size="24" font-weight="800" fill="${AMBER}">backer</text>
      <text x="24" y="76" font-size="12" fill="${SLATE_TEXT}">Your AI-Powered Money Assistant</text>
      <line x1="24" y1="90" x2="276" y2="90" stroke="#1e293b" stroke-width="1"/>
      <text x="24" y="116" font-size="13" font-weight="700" fill="${WHITE}">Cancel forgotten subscriptions</text>
      <text x="24" y="136" font-size="13" font-weight="700" fill="${WHITE}">Dispute unfair bills</text>
      <text x="24" y="156" font-size="13" font-weight="700" fill="${WHITE}">Find better energy deals</text>
      <text x="24" y="176" font-size="13" font-weight="700" fill="${WHITE}">Write complaint letters in 30s</text>
      <text x="24" y="204" font-size="11" fill="${SLATE_TEXT}">Free to join · UK consumers only</text>
      <rect x="24" y="218" width="252" height="18" fill="#1e293b" rx="3"/>
      <rect x="24" y="214" width="252" height="26" fill="${AMBER}" rx="6"/>
      <text x="150" y="232" font-size="13" font-weight="700" fill="${SLATE}" text-anchor="middle">Get Started Free</text>
    </svg>`
  },
  {
    file: 'medium-rectangle-300x250-v2.png',
    w: 300, h: 250,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="6"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="6"/>
      <text x="150" y="46" font-size="22" font-weight="800" fill="${WHITE}" text-anchor="middle">Pay<tspan fill="${AMBER}">backer</tspan></text>
      <text x="150" y="96" font-size="42" font-weight="800" fill="${AMBER}" text-anchor="middle">£312</text>
      <text x="150" y="118" font-size="11" fill="${SLATE_TEXT}" text-anchor="middle">average wasted on forgotten</text>
      <text x="150" y="134" font-size="11" fill="${SLATE_TEXT}" text-anchor="middle">subscriptions every year</text>
      <line x1="24" y1="150" x2="276" y2="150" stroke="#1e293b" stroke-width="1"/>
      <text x="150" y="174" font-size="13" fill="${WHITE}" text-anchor="middle">Our AI finds them in seconds</text>
      <text x="150" y="194" font-size="13" fill="${WHITE}" text-anchor="middle">and cancels them for you</text>
      <text x="150" y="214" font-size="11" fill="${SLATE_TEXT}" text-anchor="middle">Free to join · UK only</text>
      <rect x="24" y="224" width="252" height="16" fill="${AMBER}" rx="6"/>
      <text x="150" y="236" font-size="13" font-weight="700" fill="${SLATE}" text-anchor="middle">Find My Wasted Money</text>
    </svg>`
  },
  {
    file: 'wide-skyscraper-160x600.png',
    w: 160, h: 600,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="6"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="6"/>
      <text x="80" y="52" font-size="20" font-weight="800" fill="${WHITE}" text-anchor="middle">Pay</text>
      <text x="80" y="74" font-size="20" font-weight="800" fill="${AMBER}" text-anchor="middle">backer</text>
      <line x1="16" y1="90" x2="144" y2="90" stroke="#1e293b" stroke-width="1"/>
      <text x="80" y="118" font-size="11" fill="${SLATE_TEXT}" text-anchor="middle">Your AI-Powered</text>
      <text x="80" y="134" font-size="11" fill="${SLATE_TEXT}" text-anchor="middle">Money Assistant</text>
      <line x1="16" y1="150" x2="144" y2="150" stroke="#1e293b" stroke-width="1"/>
      <text x="80" y="186" font-size="32" font-weight="800" fill="${AMBER}" text-anchor="middle">£312</text>
      <text x="80" y="206" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">wasted every year</text>
      <text x="80" y="220" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">on forgotten subs</text>
      <line x1="16" y1="236" x2="144" y2="236" stroke="#1e293b" stroke-width="1"/>
      <text x="80" y="268" font-size="11" font-weight="700" fill="${WHITE}" text-anchor="middle">Cancel subs</text>
      <text x="80" y="290" font-size="11" font-weight="700" fill="${WHITE}" text-anchor="middle">Dispute bills</text>
      <text x="80" y="312" font-size="11" font-weight="700" fill="${WHITE}" text-anchor="middle">Find better deals</text>
      <text x="80" y="334" font-size="11" font-weight="700" fill="${WHITE}" text-anchor="middle">Write complaint</text>
      <text x="80" y="350" font-size="11" font-weight="700" fill="${WHITE}" text-anchor="middle">letters in 30s</text>
      <line x1="16" y1="368" x2="144" y2="368" stroke="#1e293b" stroke-width="1"/>
      <text x="80" y="396" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">Free to join</text>
      <text x="80" y="412" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">UK consumers only</text>
      <rect x="16" y="550" width="128" height="34" fill="${AMBER}" rx="6"/>
      <text x="80" y="572" font-size="12" font-weight="700" fill="${SLATE}" text-anchor="middle">Get Started Free</text>
    </svg>`
  },
  {
    file: 'half-page-300x600.png',
    w: 300, h: 600,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="6"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="6"/>
      <text x="150" y="66" font-size="28" font-weight="800" fill="${WHITE}" text-anchor="middle">Pay<tspan fill="${AMBER}">backer</tspan></text>
      <text x="150" y="90" font-size="13" fill="${SLATE_TEXT}" text-anchor="middle">Your AI-Powered Money Assistant</text>
      <line x1="24" y1="108" x2="276" y2="108" stroke="#1e293b" stroke-width="1"/>
      <text x="150" y="160" font-size="52" font-weight="800" fill="${AMBER}" text-anchor="middle">£312</text>
      <text x="150" y="184" font-size="12" fill="${SLATE_TEXT}" text-anchor="middle">average wasted every year on</text>
      <text x="150" y="200" font-size="12" fill="${SLATE_TEXT}" text-anchor="middle">forgotten subscriptions</text>
      <line x1="24" y1="220" x2="276" y2="220" stroke="#1e293b" stroke-width="1"/>
      <text x="24" y="254" font-size="14" font-weight="700" fill="${WHITE}">Cancel forgotten subscriptions</text>
      <text x="24" y="278" font-size="14" font-weight="700" fill="${WHITE}">Dispute unfair bills with AI</text>
      <text x="24" y="302" font-size="14" font-weight="700" fill="${WHITE}">Find better energy &amp; broadband</text>
      <text x="24" y="326" font-size="14" font-weight="700" fill="${WHITE}">Write complaint letters in 30s</text>
      <text x="24" y="350" font-size="14" font-weight="700" fill="${WHITE}">HMRC &amp; council tax challenges</text>
      <line x1="24" y1="370" x2="276" y2="370" stroke="#1e293b" stroke-width="1"/>
      <text x="150" y="400" font-size="18" font-weight="800" fill="${WHITE}" text-anchor="middle">Stop Overpaying.</text>
      <text x="150" y="424" font-size="18" font-weight="800" fill="${AMBER}" text-anchor="middle">Start Recovering.</text>
      <text x="150" y="454" font-size="12" fill="${SLATE_TEXT}" text-anchor="middle">Free to join · UK consumers only</text>
      <rect x="24" y="540" width="252" height="42" fill="${AMBER}" rx="8"/>
      <text x="150" y="566" font-size="15" font-weight="700" fill="${SLATE}" text-anchor="middle">Get Started Free</text>
    </svg>`
  },
  {
    file: 'full-banner-468x60.png',
    w: 468, h: 60,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="4"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="4"/>
      <text x="16" y="38" font-size="18" font-weight="800" fill="${WHITE}">Pay</text>
      <text x="50" y="38" font-size="18" font-weight="800" fill="${AMBER}">backer</text>
      <line x1="122" y1="14" x2="122" y2="46" stroke="#334155" stroke-width="1"/>
      <text x="134" y="28" font-size="11" fill="${SLATE_TEXT}">Stop overpaying. AI cancels subs,</text>
      <text x="134" y="44" font-size="11" fill="${SLATE_TEXT}">disputes bills &amp; finds better deals.</text>
      <rect x="340" y="13" width="112" height="34" fill="${AMBER}" rx="6"/>
      <text x="396" y="35" font-size="12" font-weight="700" fill="${SLATE}" text-anchor="middle">Get Started Free</text>
    </svg>`
  },
  {
    file: 'mobile-banner-320x50.png',
    w: 320, h: 50,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="4"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="4"/>
      <text x="12" y="32" font-size="16" font-weight="800" fill="${WHITE}">Pay</text>
      <text x="42" y="32" font-size="16" font-weight="800" fill="${AMBER}">backer</text>
      <text x="108" y="22" font-size="10" fill="${SLATE_TEXT}">Cancel subs · Dispute bills</text>
      <text x="108" y="36" font-size="10" fill="${SLATE_TEXT}">Find better deals · UK only</text>
      <rect x="224" y="10" width="84" height="30" fill="${AMBER}" rx="5"/>
      <text x="266" y="30" font-size="11" font-weight="700" fill="${SLATE}" text-anchor="middle">Free</text>
    </svg>`
  },
  {
    file: 'mobile-large-320x100.png',
    w: 320, h: 100,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="4"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="4"/>
      <text x="16" y="34" font-size="20" font-weight="800" fill="${WHITE}">Pay</text>
      <text x="54" y="34" font-size="20" font-weight="800" fill="${AMBER}">backer</text>
      <text x="210" y="22" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">Free to join · UK only</text>
      <text x="16" y="58" font-size="12" fill="${SLATE_TEXT}">AI that cancels forgotten subscriptions</text>
      <text x="16" y="74" font-size="12" fill="${SLATE_TEXT}">&amp; disputes unfair bills for you</text>
      <rect x="224" y="54" width="80" height="30" fill="${AMBER}" rx="5"/>
      <text x="264" y="74" font-size="12" font-weight="700" fill="${SLATE}" text-anchor="middle">Start Free</text>
    </svg>`
  },
  {
    file: 'square-250x250.png',
    w: 250, h: 250,
    svg: (w, h) => `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">
      <rect width="${w}" height="${h}" fill="${SLATE}" rx="6"/>
      <rect width="${w}" height="${h}" fill="none" stroke="${BORDER}" stroke-width="1" rx="6"/>
      <text x="125" y="46" font-size="20" font-weight="800" fill="${WHITE}" text-anchor="middle">Pay<tspan fill="${AMBER}">backer</tspan></text>
      <text x="125" y="66" font-size="11" fill="${SLATE_TEXT}" text-anchor="middle">Your AI-Powered Money Assistant</text>
      <line x1="20" y1="80" x2="230" y2="80" stroke="#1e293b" stroke-width="1"/>
      <text x="125" y="128" font-size="44" font-weight="800" fill="${AMBER}" text-anchor="middle">£312</text>
      <text x="125" y="150" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">average wasted on forgotten</text>
      <text x="125" y="164" font-size="10" fill="${SLATE_TEXT}" text-anchor="middle">subscriptions every year</text>
      <line x1="20" y1="178" x2="230" y2="178" stroke="#1e293b" stroke-width="1"/>
      <text x="125" y="200" font-size="12" fill="${WHITE}" text-anchor="middle">Cancel subs · Dispute bills</text>
      <text x="125" y="218" font-size="12" fill="${WHITE}" text-anchor="middle">Find better deals · UK only</text>
      <rect x="20" y="228" width="210" height="32" fill="${AMBER}" rx="6"/>
      <text x="125" y="249" font-size="13" font-weight="700" fill="${SLATE}" text-anchor="middle">Get Started Free</text>
    </svg>`
  },
];

for (const { file, w, h, svg } of banners) {
  const svgStr = svg(w, h);
  await sharp(Buffer.from(svgStr))
    .png()
    .toFile(path.join(OUT_DIR, file));
  console.log(`Created: ${file}`);
}

console.log(`\nAll ${banners.length} PNGs created in ${OUT_DIR}`);

// Zip
execSync(`cd /tmp && zip -r paybacker-banner-pngs.zip paybacker-banner-pngs/`);
console.log('Zip created: /tmp/paybacker-banner-pngs.zip');

// Email
const zipBuffer = fs.readFileSync('/tmp/paybacker-banner-pngs.zip');
const zipBase64 = zipBuffer.toString('base64');

const payload = {
  from: 'Paybacker <hello@paybacker.co.uk>',
  to: 'hello@paybacker.co.uk',
  subject: 'Paybacker — Awin Banner PNGs (All Sizes)',
  text: `Paybacker Awin Banners — PNG Format\n\nAttached is a zip file containing ${banners.length} PNG banner files ready to upload to Awin via Toolbox > My Creative.\n\nBanners included:\n${banners.map(b => `- ${b.file} (${b.w}x${b.h})`).join('\n')}\n\nAll banners are PNG format. When uploading to Awin, select Image as the creative type and choose the PNG file.\n\nThe Paybacker Team`,
  attachments: [{ filename: 'paybacker-banner-pngs.zip', content: zipBase64 }]
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
