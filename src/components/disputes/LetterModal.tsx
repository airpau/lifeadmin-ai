'use client';

import { useState, useEffect } from 'react';
import {
  X, Sparkles, Pencil, Copy, CheckCircle, CheckCircle2, Download, Loader2, ExternalLink,
} from 'lucide-react';
import { AI_LETTER_DISCLAIMER_HTML } from '@/lib/legal-disclaimer';
import type { LetterModalProps } from '@/types/disputes';

export default function LetterModal({
  content,
  title,
  legalRefs,
  rightsPills,
  onClose,
  disputeId,
  providerName,
  onSentMarked,
  threadReply,
  alreadySent,
}: LetterModalProps) {
  const [copied, setCopied] = useState(false);
  const [providerEmail, setProviderEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const [workingContent, setWorkingContent] = useState(content);
  const [editing, setEditing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refineError, setRefineError] = useState<string | null>(null);

  useEffect(() => { setWorkingContent(content); }, [content]);

  useEffect(() => {
    if (!providerName) return;
    let cancelled = false;
    fetch(`/api/subscriptions/cancel-info?provider=${encodeURIComponent(providerName)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setProviderEmail(d?.info?.email ?? null); })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [providerName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(workingContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [copyOpenStatus, setCopyOpenStatus] = useState<null | 'copying' | 'done'>(null);
  const handleCopyAndOpenThread = async () => {
    if (!threadReply?.webLink) return;
    try {
      setCopyOpenStatus('copying');
      await navigator.clipboard.writeText(workingContent);
      setCopyOpenStatus('done');
      window.open(threadReply.webLink, '_blank', 'noopener,noreferrer');
      setTimeout(() => setCopyOpenStatus(null), 3000);
    } catch {
      setCopyOpenStatus(null);
      window.open(threadReply.webLink, '_blank', 'noopener,noreferrer');
      alert('Could not auto-copy the letter. Use the "Copy Letter" button first, then click Reply in your inbox.');
    }
  };

  const handleRefine = async () => {
    const instruction = refineInstruction.trim();
    if (instruction.length < 3) {
      setRefineError('Tell us what to change — e.g. "make it more polite" or "add the £85 figure".');
      return;
    }
    setRefining(true);
    setRefineError(null);
    try {
      const res = await fetch('/api/disputes/refine-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letter: workingContent, instruction, disputeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRefineError(data?.error || 'Refine failed — try again.');
        return;
      }
      if (typeof data?.letter === 'string' && data.letter.trim().length > 50) {
        setWorkingContent(data.letter.trim());
        setRefineOpen(false);
        setRefineInstruction('');
      } else {
        setRefineError('Model returned an empty letter — try a different instruction.');
      }
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRefining(false);
    }
  };

  const handleResetToOriginal = () => {
    if (!confirm('Discard your edits and go back to the original letter?')) return;
    setWorkingContent(content);
  };

  const handleMarkSent = async () => {
    if (!disputeId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/letter-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerEmail,
          letter: workingContent,
          edited: workingContent !== content,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSentNote(
          data?.watchdog_link_created
            ? "Marked as sent. We'll watch your inbox for the reply and ping you on Telegram + dashboard when it lands."
            : 'Marked as sent. Check this dispute for the reply.',
        );
        onSentMarked?.();
      } else {
        setSentNote('Could not mark as sent. Try again in a moment.');
      }
    } catch {
      setSentNote('Could not mark as sent. Try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  const handlePDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:0 40px;line-height:1.8;color:#000}
      pre{white-space:pre-wrap;font-family:'Times New Roman',serif;font-size:13px;line-height:1.8}
      .refs{margin-top:24px;padding-top:16px;border-top:1px solid #ccc;font-size:11px;color:#555}
      .disclaimer{margin-top:24px;padding-top:16px;border-top:1px solid #ccc;font-size:10px;color:#555;text-align:center;line-height:1.6}
      @media print{body{margin:20mm 25mm}}</style></head><body>
      <pre>${workingContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      ${legalRefs.length > 0 ? `<div class="refs"><strong>Legal references:</strong> ${legalRefs.join(' · ')}</div>` : ''}
      <div class="disclaimer">${AI_LETTER_DISCLAIMER_HTML}</div>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    printWindow.document.close();
  };

  const count = rightsPills?.length ?? 0;
  const backingBadge = count >= 3 ? (
    <span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
      Strong legal backing
    </span>
  ) : count >= 1 ? (
    <span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-600 border border-amber-200">
      Some legal backing
    </span>
  ) : (
    <span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
      Review carefully
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 style={{fontSize:18,fontWeight:700,letterSpacing:"-.01em",margin:"0 0 10px"}}>{title}</h2>
            {backingBadge}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-xl p-6 border border-slate-200/50 mb-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <span className="text-xs text-slate-500">
                {workingContent !== content
                  ? <>Edited — <button onClick={handleResetToOriginal} className="underline hover:text-slate-700">reset to original</button></>
                  : 'AI-drafted letter'}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setRefineOpen(v => !v)}
                  disabled={editing || refining}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {refining ? 'Refining…' : 'Refine with AI'}
                </button>
                <button
                  onClick={() => setEditing(v => !v)}
                  disabled={refining}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {editing ? 'Done editing' : 'Edit manually'}
                </button>
              </div>
            </div>

            {refineOpen && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
                <label className="block text-xs font-semibold text-purple-900 mb-2">
                  What would you like changed?
                </label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-purple-300 bg-white text-sm focus:outline-none focus:border-purple-500 mb-2"
                  rows={2}
                  placeholder='e.g. "Make it more polite", "Add the £85 figure", "Shorten to 3 paragraphs"'
                  value={refineInstruction}
                  onChange={(e) => setRefineInstruction(e.target.value)}
                  maxLength={500}
                  disabled={refining}
                />
                {refineError && (
                  <p className="text-xs text-rose-700 mb-2">{refineError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefine}
                    disabled={refining || refineInstruction.trim().length < 3}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {refining ? <><Loader2 className="h-3 w-3 animate-spin" /> Working…</> : <>Apply</>}
                  </button>
                  <button
                    onClick={() => { setRefineOpen(false); setRefineInstruction(''); setRefineError(null); }}
                    disabled={refining}
                    className="text-xs px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-purple-700 ml-auto">
                    Counts as one letter against your monthly cap.
                  </span>
                </div>
              </div>
            )}

            {editing ? (
              <textarea
                value={workingContent}
                onChange={(e) => setWorkingContent(e.target.value)}
                className="w-full text-sm text-slate-700 font-mono leading-relaxed bg-slate-50 border border-slate-300 rounded-lg p-4 focus:outline-none focus:border-emerald-500 min-h-[400px]"
              />
            ) : (
              <pre
                className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed"
                onCopy={(e) => {
                  const sel = window.getSelection();
                  if (!sel) return;
                  e.preventDefault();
                  e.clipboardData?.setData('text/plain', sel.toString());
                }}
              >{workingContent}</pre>
            )}
          </div>
          {(rightsPills && rightsPills.length > 0 || legalRefs.length > 0) && (
            <div className="bg-white/50 rounded-lg p-4 border border-slate-200/50 mb-3">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Your rights used in this letter</h3>
              <div className="flex flex-wrap gap-1.5">
                {rightsPills && rightsPills.length > 0
                  ? rightsPills.map((pill, i) => (
                      <a
                        key={i}
                        href={pill.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors inline-flex items-center gap-1"
                        title={pill.strength === 'strong' ? 'Strong legal protection' : pill.strength === 'moderate' ? 'Moderate legal protection' : 'Legal reference'}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          pill.strength === 'strong' ? 'bg-green-500' :
                          pill.strength === 'moderate' ? 'bg-orange-500' :
                          'bg-gray-400'
                        }`} />
                        {pill.label}
                      </a>
                    ))
                  : legalRefs.map((ref, i) => (
                      <span key={i} className="text-[11px] bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        {ref}
                      </span>
                    ))
                }
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-600 text-center mt-3 leading-relaxed">{AI_LETTER_DISCLAIMER_HTML}</p>
        </div>
        <div className="flex flex-col gap-3 p-6 border-t border-slate-200/50 flex-shrink-0">
          {sentNote && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {sentNote}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {threadReply?.webLink && (
              <button
                onClick={handleCopyAndOpenThread}
                disabled={copyOpenStatus === 'copying'}
                className="flex-1 min-w-[160px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg transition-all font-medium disabled:opacity-60"
                title={threadReply.senderAddress ? `Reply to ${threadReply.senderAddress} in ${threadReply.provider === 'outlook' ? 'Outlook' : 'Gmail'}` : undefined}
              >
                {copyOpenStatus === 'done'
                  ? <><CheckCircle className="h-4 w-4" /> Letter copied · opening…</>
                  : <><ExternalLink className="h-4 w-4" /> Reply in {threadReply.provider === 'outlook' ? 'Outlook' : 'Gmail'}</>
                }
              </button>
            )}
            <button onClick={handleCopy} className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 py-3 rounded-lg transition-all font-medium">
              {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Letter'}
            </button>
            <button onClick={handlePDF} className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 py-3 rounded-lg transition-all font-medium">
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>
          {threadReply?.webLink && (
            <p className="text-[11px] text-slate-500 text-center -mt-1">
              We&apos;ll copy the letter and open the supplier&apos;s thread — click Reply and paste with Cmd/Ctrl-V.
            </p>
          )}
          {providerEmail && (
            <p className="text-[11px] text-slate-500 text-center -mt-1">
              Tip: copy the letter, then paste into a new email to <span className="font-mono">{providerEmail}</span>.
            </p>
          )}
          {disputeId && !sentNote && (
            alreadySent ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="This letter is already logged as sent — we're tracking the reply."
                className="w-full flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 py-3 rounded-lg font-medium opacity-70 cursor-not-allowed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Sent &#10003; — tracking the reply
              </button>
            ) : (
              <button
                onClick={handleMarkSent}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 py-3 rounded-lg transition-all font-medium disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                I&apos;ve sent it — track the reply
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
