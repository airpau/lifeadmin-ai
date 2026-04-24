'use client';

/**
 * Renders the body of an imported supplier email with sensible
 * whitespace cleanup + a collapse/expand toggle for long messages.
 *
 * Why this exists: Gmail / Outlook bodies stripped to plain text
 * (see stripHtml in src/lib/dispute-sync/fetchers.ts) end up riddled
 * with runs of blank lines, tracking-pixel placeholders and
 * unsubscribe footers that make the dispute timeline unreadable.
 * This component normalises the text on the fly so older imported
 * messages benefit too — no DB backfill needed.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const SIGNATURE_CUT_PATTERNS = [
  /^-{2,}\s*$/,
  /^_{2,}\s*$/,
  /^unsubscribe\b/i,
  /^this email was sent to\b/i,
  /^this message was sent to\b/i,
  /^manage preferences\b/i,
  /^notice of confidentiality\b/i,
  /^disclaimer\b/i,
  /^if you (?:no longer )?wish (?:to receive|not)\b/i,
  /^to stop receiving\b/i,
  /^you (?:are|have been) receiving this\b/i,
  /^please do not reply\b/i,
  /^sent from my (?:iphone|ipad|android)\b/i,
  /^©/,
  /^copyright\s+©?\s*\d{4}/i,
];

function cleanEmailBody(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Drop zero-width + unusual whitespace Gmail leaves behind.
  text = text.replace(/[​-‍﻿]/g, '');
  // Collapse non-breaking spaces — they survive stripHtml + cause wide gaps.
  text = text.replace(/ /g, ' ');

  const lines = text.split('\n');
  const cleaned: string[] = [];
  let cutReached = false;
  for (const rawLine of lines) {
    if (cutReached) break;
    const line = rawLine.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ').trim();
    // Tracking-pixel remnants the HTML strip leaves behind.
    if (/^\s*\[?\s*(image|logo|banner|tracking|pixel)\s*\]?\s*$/i.test(line)) continue;
    // Footer / signature start — stop there; anything below is noise.
    if (SIGNATURE_CUT_PATTERNS.some((re) => re.test(line))) { cutReached = true; break; }
    cleaned.push(line);
  }

  // Collapse runs of blank lines down to a single blank.
  const collapsed: string[] = [];
  let blank = 0;
  for (const l of cleaned) {
    if (l === '') {
      blank++;
      if (blank === 1) collapsed.push('');
    } else {
      blank = 0;
      collapsed.push(l);
    }
  }

  // Trim leading + trailing blank lines.
  while (collapsed.length && collapsed[0] === '') collapsed.shift();
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();

  return collapsed.join('\n');
}

function firstNLines(text: string, n: number): { head: string; hasMore: boolean } {
  const lines = text.split('\n');
  if (lines.length <= n) return { head: text, hasMore: false };
  return { head: lines.slice(0, n).join('\n'), hasMore: true };
}

export default function EmailCorrespondenceBody({ content }: { content: string }) {
  const cleaned = useMemo(() => cleanEmailBody(content), [content]);
  const [expanded, setExpanded] = useState(false);
  const { head, hasMore } = firstNLines(cleaned, 8);
  const display = expanded || !hasMore ? cleaned : head;

  return (
    <div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed break-words">
        {display}
      </p>
      {hasMore && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 mt-2"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Show full email</>
          )}
        </button>
      )}
    </div>
  );
}
