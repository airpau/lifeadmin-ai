'use client';

import { useState } from 'react';
import {
  FileText, Mail, Phone, MessageSquare, StickyNote, X, Paperclip, Loader2,
} from 'lucide-react';

interface Props {
  disputeId: string;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}

export default function AddCorrespondenceModal({ disputeId, onClose, onAdded }: Props) {
  const [entryType, setEntryType] = useState('user_note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const typeOptions = [
    { value: 'company_email', label: 'Email from the company', icon: Mail },
    { value: 'company_letter', label: 'Letter from the company', icon: FileText },
    { value: 'company_response', label: 'Other response from company', icon: MessageSquare },
    { value: 'phone_call', label: 'Phone call summary', icon: Phone },
    { value: 'user_note', label: 'Your own note', icon: StickyNote },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      let attachments: any[] = [];
      if (attachedFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', attachedFile);
        const uploadRes = await fetch(`/api/disputes/${disputeId}/upload`, { method: 'POST', body: fd });
        if (uploadRes.ok) {
          const fileData = await uploadRes.json();
          attachments = [{ url: fileData.url, filename: fileData.filename, type: fileData.type, size: fileData.size }];
        }
        setUploading(false);
      }

      const todayIso = new Date().toISOString().split('T')[0];
      const entryDateIso = entryDate === todayIso
        ? new Date().toISOString()
        : new Date(entryDate).toISOString();

      const res = await fetch(`/api/disputes/${disputeId}/correspondence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_type: entryType,
          title: title || null,
          content,
          attachments,
          entry_date: entryDateIso,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(errBody.error || `Failed to save (HTTP ${res.status})`);
      }
      await onAdded();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save. Please try again.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200/50 rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl" style={{ maxHeight: 'calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 0px))' }}>
        <form onSubmit={handleSubmit} className="flex flex-col" style={{ maxHeight: 'calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex items-center justify-between p-5 border-b border-slate-200/50 flex-shrink-0">
            <h2 className="text-lg font-bold text-slate-900">Add to your dispute</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0"
            style={{ WebkitOverflowScrolling: 'touch' as any }}
          >
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">What are you adding?</label>
              <div className="grid grid-cols-1 gap-2">
                {typeOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEntryType(opt.value)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-left transition-all ${
                        entryType === opt.value
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-slate-900'
                          : 'bg-white border border-slate-200/50 text-slate-600 hover:border-slate-200'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Title <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder={entryType === 'phone_call' ? 'e.g. Spoke to customer service' : 'e.g. Their response to my complaint'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                {entryType === 'phone_call' ? 'What happened on the call?' : 'Paste or type the content'} *
              </label>
              <textarea
                required
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder={
                  entryType === 'phone_call'
                    ? 'Summarise the phone call - who you spoke to, what they said, any reference numbers...'
                    : entryType === 'user_note'
                    ? 'Add any notes for yourself about this dispute...'
                    : 'Paste the email or letter content here...'
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Attach a file <span className="text-slate-500 font-normal">(optional - screenshot, scan, or photo)</span>
              </label>
              {attachedFile ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-600 text-xs font-medium truncate max-w-[200px]">{attachedFile.name}</span>
                  </div>
                  <button type="button" onClick={() => setAttachedFile(null)} className="text-slate-500 hover:text-slate-900 text-xs">Remove</button>
                </div>
              ) : (
                <label className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-dashed border-slate-200/50 rounded-lg text-slate-500 hover:border-emerald-500/50 hover:text-slate-700 cursor-pointer transition-all text-sm">
                  <Paperclip className="h-4 w-4 text-emerald-600" />
                  <span>Upload a screenshot, scan or photo</span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.heic,.heif"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum 10MB.'); return; }
                        setAttachedFile(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">When did this happen?</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="p-5 pt-3 border-t border-slate-200/50 flex-shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))' }}>
            <button
              type="submit"
              disabled={saving || uploading || !content.trim()}
              className="w-full cta font-semibold py-3 rounded-lg transition-all disabled:opacity-50"
            >
              {uploading ? 'Uploading file...' : saving ? 'Saving...' : 'Add to dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
