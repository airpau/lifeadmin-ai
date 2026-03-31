'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Sparkles, Download, Copy, CheckCircle, Clock, History,
  RotateCcw, RefreshCw, X, ThumbsUp, Pencil, Volume2, Loader2,
  Plus, MessageSquare, Phone, Mail, Upload, ChevronLeft, Send,
  AlertCircle, MoreVertical, StickyNote, Shield, Paperclip, Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { capture } from '@/lib/posthog';
import UpgradeModal from '@/components/UpgradeModal';
import ShareWinModal from '@/components/share/ShareWinModal';
import { shouldShowShareModal, hasSharedThisSession } from '@/lib/share-triggers';

// ============================================================
// Types
// ============================================================
interface Dispute {
  id: string;
  provider_name: string;
  provider_type: string | null;
  account_number: string | null;
  issue_type: string;
  issue_summary: string;
  desired_outcome: string | null;
  disputed_amount: number | null;
  status: string;
  money_recovered: number;
  created_at: string;
  updated_at: string;
  letter_count: number;
  message_count: number;
  last_activity: string;
  correspondence?: Correspondence[];
  contract_extractions?: ContractExtraction[];
}

interface ContractExtraction {
  id: string;
  file_url: string | null;
  file_name: string | null;
  provider_name: string | null;
  minimum_term: string | null;
  notice_period: string | null;
  cancellation_fee: string | null;
  early_exit_fee: string | null;
  price_increase_clause: string | null;
  auto_renewal: string | null;
  cooling_off_period: string | null;
  unfair_clauses: string[];
  raw_summary: string | null;
  created_at: string;
}

interface RightsPill {
  label: string;
  url: string;
  strength: string;
}

interface Correspondence {
  id: string;
  entry_type: string;
  title: string | null;
  content: string;
  summary: string | null;
  attachments: any[];
  task_id: string | null;
  entry_date: string;
  created_at: string;
  legal_references?: string[];
  rights_pills?: RightsPill[];
  estimated_success?: number;
  next_steps?: string[];
  escalation_path?: string;
}

// ============================================================
// Helpers
// ============================================================
const ISSUE_TYPE_LABELS: Record<string, string> = {
  complaint: 'Company Complaint',
  energy_dispute: 'Energy Bill Dispute',
  broadband_complaint: 'Broadband / Mobile',
  flight_compensation: 'Flight Compensation',
  parking_appeal: 'Parking Appeal',
  debt_dispute: 'Debt Dispute',
  refund_request: 'Refund Request',
  hmrc_tax_rebate: 'HMRC Tax Rebate',
  council_tax_band: 'Council Tax',
  dvla_vehicle: 'DVLA',
  nhs_complaint: 'NHS Complaint',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-blue-500/10 text-blue-400' },
  awaiting_response: { label: 'Waiting for reply', className: 'bg-purple-500/10 text-purple-400' },
  escalated: { label: 'Escalated', className: 'bg-orange-500/10 text-orange-400' },
  resolved_won: { label: 'Won', className: 'bg-green-500/10 text-green-500' },
  resolved_partial: { label: 'Partially resolved', className: 'bg-yellow-500/10 text-yellow-400' },
  resolved_lost: { label: 'Not resolved', className: 'bg-red-500/10 text-red-400' },
  closed: { label: 'Closed', className: 'bg-slate-500/10 text-slate-400' },
};

const ENTRY_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; className: string }> = {
  ai_letter: { label: 'Your letter', icon: FileText, className: 'border-mint-400/30 bg-mint-400/5' },
  company_email: { label: 'Their email', icon: Mail, className: 'border-orange-400/30 bg-orange-400/5' },
  company_letter: { label: 'Their letter', icon: FileText, className: 'border-orange-400/30 bg-orange-400/5' },
  phone_call: { label: 'Phone call', icon: Phone, className: 'border-blue-400/30 bg-blue-400/5' },
  user_note: { label: 'Your note', icon: StickyNote, className: 'border-slate-400/30 bg-slate-400/5' },
  company_response: { label: 'Their response', icon: MessageSquare, className: 'border-orange-400/30 bg-orange-400/5' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w !== 1 ? 's' : ''} ago`;
  }
  return formatDate(d);
}

// ============================================================
// Letter Modal (reused from before)
// ============================================================
function LetterModal({ content, title, legalRefs, rightsPills, onClose }: {
  content: string;
  title: string;
  legalRefs: string[];
  rightsPills?: RightsPill[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:0 40px;line-height:1.8;color:#000}
      pre{white-space:pre-wrap;font-family:'Times New Roman',serif;font-size:13px;line-height:1.8}
      .refs{margin-top:24px;padding-top:16px;border-top:1px solid #ccc;font-size:11px;color:#555}
      @media print{body{margin:20mm 25mm}}</style></head><body>
      <pre>${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      ${legalRefs.length > 0 ? `<div class="refs"><strong>Legal references:</strong> ${legalRefs.join(' · ')}</div>` : ''}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-navy-700/50 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-navy-950 rounded-xl p-6 border border-navy-700/50 mb-4">
            <pre
              className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed"
              onCopy={(e) => {
                // Override browser's default rich-text copy (which carries white colour styling).
                // Force plain text so the letter pastes correctly into Gmail, Outlook, etc.
                const sel = window.getSelection();
                if (!sel) return;
                e.preventDefault();
                e.clipboardData?.setData('text/plain', sel.toString());
              }}
            >{content}</pre>
          </div>
          {(rightsPills && rightsPills.length > 0 || legalRefs.length > 0) && (
            <div className="bg-navy-950/50 rounded-lg p-4 border border-navy-700/50 mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Your rights used in this letter</h3>
              <div className="flex flex-wrap gap-1.5">
                {rightsPills && rightsPills.length > 0
                  ? rightsPills.map((pill, i) => (
                      <a
                        key={i}
                        href={pill.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] bg-mint-400/10 text-mint-400 px-2.5 py-1 rounded-full border border-mint-400/20 hover:bg-mint-400/20 transition-colors inline-flex items-center gap-1"
                        title={pill.strength === 'strong' ? 'Strong legal protection' : pill.strength === 'moderate' ? 'Moderate legal protection' : 'Legal reference'}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          pill.strength === 'strong' ? 'bg-green-500' :
                          pill.strength === 'moderate' ? 'bg-amber-500' :
                          'bg-gray-400'
                        }`} />
                        {pill.label}
                      </a>
                    ))
                  : legalRefs.map((ref, i) => (
                      <span key={i} className="text-[11px] bg-mint-400/10 text-mint-400 px-2.5 py-1 rounded-full border border-mint-400/20">
                        {ref}
                      </span>
                    ))
                }
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-600 text-center mt-3 leading-relaxed">This letter was generated with AI assistance using publicly available legal information from legislation.gov.uk. It does not constitute legal advice. If you are unsure about your rights, please consult a qualified solicitor, Citizens Advice (citizensadvice.org.uk), or your relevant ombudsman.</p>
        </div>
        <div className="flex gap-3 p-6 border-t border-navy-700/50 flex-shrink-0">
          <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 rounded-lg transition-all font-medium">
            {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy Letter'}
          </button>
          <button onClick={handlePDF} className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 py-3 rounded-lg transition-all font-semibold">
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Add Correspondence Modal
// ============================================================
function AddCorrespondenceModal({ disputeId, onClose, onAdded }: {
  disputeId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [entryType, setEntryType] = useState('company_email');
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
      // Upload file first if attached
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

      const res = await fetch(`/api/disputes/${disputeId}/correspondence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_type: entryType,
          title: title || null,
          content,
          attachments,
          entry_date: new Date(entryDate).toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onAdded();
      onClose();
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-navy-700/50">
          <h2 className="text-lg font-bold text-white">Add to your dispute</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">What are you adding?</label>
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
                        ? 'bg-mint-400/10 border border-mint-400/30 text-white'
                        : 'bg-navy-950 border border-navy-700/50 text-slate-400 hover:border-navy-600'
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
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Title <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
              placeholder={entryType === 'phone_call' ? 'e.g. Spoke to customer service' : 'e.g. Their response to my complaint'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {entryType === 'phone_call' ? 'What happened on the call?' : 'Paste or type the content'} *
            </label>
            <textarea
              required
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
              placeholder={
                entryType === 'phone_call'
                  ? 'Summarise the phone call - who you spoke to, what they said, any reference numbers...'
                  : entryType === 'user_note'
                  ? 'Add any notes for yourself about this dispute...'
                  : 'Paste the email or letter content here...'
              }
            />
          </div>

          {/* File attachment */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Attach a file <span className="text-slate-500 font-normal">(optional - screenshot, scan, or photo)</span>
            </label>
            {attachedFile ? (
              <div className="flex items-center justify-between bg-mint-400/10 border border-mint-400/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-mint-400" />
                  <span className="text-mint-400 text-xs font-medium truncate max-w-[200px]">{attachedFile.name}</span>
                </div>
                <button type="button" onClick={() => setAttachedFile(null)} className="text-slate-500 hover:text-white text-xs">Remove</button>
              </div>
            ) : (
              <label className="flex items-center gap-3 w-full px-4 py-3 bg-navy-950 border border-dashed border-navy-700/50 rounded-lg text-slate-500 hover:border-mint-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm">
                <Paperclip className="h-4 w-4 text-mint-400" />
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
            <label className="block text-sm font-medium text-slate-300 mb-2">When did this happen?</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
            />
          </div>

          <button
            type="submit"
            disabled={saving || uploading || !content.trim()}
            className="w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50"
          >
            {uploading ? 'Uploading file...' : saving ? 'Saving...' : 'Add to dispute'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Dispute Detail View — the thread
// ============================================================
function DisputeDetail({ disputeId, onBack }: { disputeId: string; onBack: () => void }) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [letterModal, setLetterModal] = useState<{ content: string; title: string; refs: string[]; pills?: RightsPill[] } | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  const [providerInfo, setProviderInfo] = useState<any>(null);

  const fetchDispute = async () => {
    try {
      const res = await fetch(`/api/disputes/${disputeId}`);
      if (res.ok) setDispute(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const FOLLOWUP_CAPTIONS = [
    { icon: '👀', text: 'Reading their response...' },
    { icon: '🧠', text: 'Analysing the conversation thread...' },
    { icon: '⚖️', text: 'Researching stronger legal arguments...' },
    { icon: '✍️', text: 'Drafting your follow-up letter...' },
    { icon: '🎯', text: 'Making your follow-up impossible to ignore...' },
  ];
  const [loadingCaption, setLoadingCaption] = useState(0);
  const latestLetterRef = useRef<HTMLDivElement>(null);
  const [previousLength, setPreviousLength] = useState(0);

  useEffect(() => {
    if (generating) {
      setLoadingCaption(0);
      const interval = setInterval(() => {
        setLoadingCaption(prev => (prev + 1) % FOLLOWUP_CAPTIONS.length);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [generating]);

  useEffect(() => {
    if (dispute?.correspondence) {
      if (dispute.correspondence.length > previousLength && previousLength > 0) {
        setTimeout(() => {
          latestLetterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
      setPreviousLength(dispute.correspondence.length);
    }
  }, [dispute?.correspondence?.length]);

  useEffect(() => { fetchDispute(); }, [disputeId]);

  // Fetch provider info when dispute loads
  useEffect(() => {
    if (dispute?.provider_name) {
      fetch(`/api/provider-terms?provider=${encodeURIComponent(dispute.provider_name)}`)
        .then(r => r.json())
        .then(d => { if (d) setProviderInfo(d); })
        .catch(() => {});
    }
  }, [dispute?.provider_name]);

  const updateStatus = async (newStatus: string) => {
    await fetch(`/api/disputes/${disputeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatusDropdown(false);
    fetchDispute();
  };

  const generateFollowUp = async () => {
    if (!dispute) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/complaints/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: dispute.provider_name,
          issueDescription: dispute.issue_summary,
          desiredOutcome: dispute.desired_outcome || 'Resolve the issue',
          amount: dispute.disputed_amount ? String(dispute.disputed_amount) : undefined,
          accountNumber: dispute.account_number || undefined,
          letterType: dispute.issue_type,
          disputeId: dispute.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate');
      }
      
      const data = await res.json();
      setShowGenerate(false);
      
      // Immediately display the newly generated letter
      setLetterModal({
        content: data.letter,
        title: 'Your letter',
        refs: data.legalReferences || [],
        pills: data.rightsPills || [],
      });
      
      fetchDispute();
    } catch (error: any) {
      alert(error.message || 'Failed to generate letter. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-mint-400" />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Dispute not found</p>
        <button onClick={onBack} className="text-mint-400 mt-2">Go back</button>
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[dispute.status] || { label: dispute.status, className: 'bg-slate-500/10 text-slate-400' };

  return (
    <div className="max-w-4xl">
      {letterModal && (
        <LetterModal
          content={letterModal.content}
          title={letterModal.title}
          legalRefs={letterModal.refs}
          rightsPills={letterModal.pills}
          onClose={() => setLetterModal(null)}
        />
      )}

      {showAddModal && (
        <AddCorrespondenceModal
          disputeId={disputeId}
          onClose={() => setShowAddModal(false)}
          onAdded={fetchDispute}
        />
      )}

      {/* Back + header */}
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm transition-all">
        <ChevronLeft className="h-4 w-4" /> Back to all disputes
      </button>

      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              {dispute.provider_name}
            </h1>
            <p className="text-slate-400 text-sm mt-1">{ISSUE_TYPE_LABELS[dispute.issue_type] || dispute.issue_type}</p>
          </div>
          <div className="flex items-center gap-3">
            {dispute.disputed_amount && dispute.disputed_amount > 0 && (
              <span className="text-mint-400 font-bold text-lg">£{dispute.disputed_amount}</span>
            )}
            <div className="relative">
              <button
                onClick={() => setStatusDropdown(!statusDropdown)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium cursor-pointer ${statusConf.className}`}
              >
                {statusConf.label}
              </button>
              {statusDropdown && (
                <div className="absolute right-0 top-full mt-2 bg-navy-800 border border-navy-700/50 rounded-lg shadow-xl z-10 min-w-[180px]">
                  {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
                    <button
                      key={key}
                      onClick={() => updateStatus(key)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-navy-700 transition-all first:rounded-t-lg last:rounded-b-lg ${
                        dispute.status === key ? 'text-mint-400' : 'text-slate-300'
                      }`}
                    >
                      {conf.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="text-slate-300 text-sm">{dispute.issue_summary}</p>
        {dispute.desired_outcome && (
          <p className="text-slate-500 text-xs mt-2">Outcome wanted: {dispute.desired_outcome}</p>
        )}
        <p className="text-slate-600 text-xs mt-2">Started {formatDate(dispute.created_at)}</p>
      </div>

      {/* Provider Info Card */}
      {providerInfo && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">About {providerInfo.display_name}</h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {providerInfo.cancellation_method && (
              <div className="bg-navy-950 rounded-lg px-3 py-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">How to cancel</p>
                <p className="text-slate-300 capitalize">{providerInfo.cancellation_method}</p>
                {providerInfo.cancellation_phone && <p className="text-mint-400">{providerInfo.cancellation_phone}</p>}
                {providerInfo.cancellation_url && (
                  <a href={providerInfo.cancellation_url} target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:underline">Cancel online</a>
                )}
              </div>
            )}
            {providerInfo.complaints_url && (
              <div className="bg-navy-950 rounded-lg px-3 py-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">How to complain</p>
                {providerInfo.complaints_email && <p className="text-slate-300">{providerInfo.complaints_email}</p>}
                {providerInfo.complaints_phone && <p className="text-slate-300">{providerInfo.complaints_phone}</p>}
                <a href={providerInfo.complaints_url} target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:underline">Complaints page</a>
              </div>
            )}
            {providerInfo.complaints_response_days && (
              <div className="bg-navy-950 rounded-lg px-3 py-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Response deadline</p>
                <p className="text-slate-300">{providerInfo.complaints_response_days} days to respond</p>
              </div>
            )}
            {providerInfo.ombudsman_name && (
              <div className="bg-navy-950 rounded-lg px-3 py-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Escalate to</p>
                <a href={providerInfo.ombudsman_url} target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:underline">{providerInfo.ombudsman_name}</a>
              </div>
            )}
            {providerInfo.early_exit_fee_info && (
              <div className="bg-navy-950 rounded-lg px-3 py-2 sm:col-span-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Exit fees</p>
                <p className="text-slate-300">{providerInfo.early_exit_fee_info}</p>
              </div>
            )}
          </div>
          {providerInfo.terms_url && (
            <a href={providerInfo.terms_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-mint-400 mt-3 inline-block">
              View {providerInfo.display_name} T&Cs
            </a>
          )}
        </div>
      )}

      {/* Thread */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Your dispute timeline</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-navy-800 hover:bg-navy-700 text-slate-300 rounded-lg text-sm transition-all"
            >
              <Plus className="h-4 w-4" /> Add update
            </button>
            <button
              onClick={generateFollowUp}
              className="flex items-center gap-2 px-3 py-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg text-sm transition-all disabled:opacity-50 min-w-[200px] justify-center"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{FOLLOWUP_CAPTIONS[loadingCaption].text}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Write next letter</span>
                </>
              )}
            </button>
          </div>
        </div>

        {(!dispute.correspondence || dispute.correspondence.length === 0) ? (
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-12 text-center">
            <MessageSquare className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">No correspondence yet</p>
            <p className="text-slate-500 text-sm mb-6">Generate your first letter or add what the company has sent you</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-navy-800 hover:bg-navy-700 text-slate-300 rounded-lg text-sm transition-all"
              >
                <Plus className="h-4 w-4" /> Add their response
              </button>
              <button
                onClick={generateFollowUp}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2.5 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg text-sm transition-all disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Write your first letter
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {dispute.correspondence?.map((entry, index) => {
              const config = ENTRY_TYPE_CONFIG[entry.entry_type] || ENTRY_TYPE_CONFIG.user_note;
              const Icon = config.icon;
              const isAiLetter = entry.entry_type === 'ai_letter';
              const isFromCompany = ['company_email', 'company_letter', 'company_response'].includes(entry.entry_type);

              return (
                <div
                  ref={index === (dispute.correspondence?.length || 0) - 1 ? latestLetterRef : null}
                  key={entry.id}
                  className={`border rounded-2xl p-5 transition-all ${config.className} ${
                    isAiLetter ? 'cursor-pointer hover:border-mint-400/50' : ''
                  }`}
                  onClick={() => {
                    if (isAiLetter) {
                      setLetterModal({
                        content: entry.content,
                        title: entry.title || 'Your letter',
                        refs: entry.legal_references || [],
                        pills: entry.rights_pills || [],
                      });
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isFromCompany ? 'text-orange-400' : isAiLetter ? 'text-mint-400' : 'text-slate-400'}`} />
                      <span className={`text-sm font-medium ${isFromCompany ? 'text-orange-300' : isAiLetter ? 'text-mint-300' : 'text-slate-300'}`}>
                        {config.label}
                      </span>
                      {entry.title && (
                        <span className="text-slate-500 text-sm">— {entry.title}</span>
                      )}
                    </div>
                    <span className="text-slate-600 text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(entry.entry_date)}
                    </span>
                  </div>

                  {isAiLetter ? (
                    <>
                      <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed line-clamp-6">
                        {entry.content}
                      </pre>
                      {/* Confidence indicator */}
                      <div className="flex items-center gap-4 mt-3 flex-wrap">
                        {entry.estimated_success != null && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            entry.estimated_success >= 80 ? 'bg-green-500/10 text-green-400' :
                            entry.estimated_success >= 50 ? 'bg-amber-500/10 text-amber-400' :
                            'bg-red-500/10 text-red-400'
                          }`}>
                            {entry.estimated_success >= 80 ? 'Strong case' :
                             entry.estimated_success >= 50 ? 'Good case' :
                             'Worth trying'} ({entry.estimated_success}%)
                          </span>
                        )}
                        <span className="text-xs text-mint-400 ml-auto">Click to view full letter</span>
                      </div>
                      {/* Your rights pills — use URL-linked pills when available */}
                      {((entry.rights_pills && entry.rights_pills.length > 0) || (entry.legal_references && entry.legal_references.length > 0)) && (
                        <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] text-slate-500 mr-1 self-center">Your rights:</span>
                          {entry.rights_pills && entry.rights_pills.length > 0
                            ? entry.rights_pills.slice(0, 4).map((pill: RightsPill, i: number) => (
                                <a
                                  key={i}
                                  href={pill.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] bg-mint-400/10 text-mint-400 px-2 py-0.5 rounded-full border border-mint-400/20 hover:bg-mint-400/20 transition-colors inline-flex items-center gap-1"
                                  title={pill.strength === 'strong' ? 'Strong legal protection' : pill.strength === 'moderate' ? 'Moderate legal protection' : 'Legal reference'}
                                >
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                    pill.strength === 'strong' ? 'bg-green-500' :
                                    pill.strength === 'moderate' ? 'bg-amber-500' :
                                    'bg-gray-400'
                                  }`} />
                                  {pill.label}
                                </a>
                              ))
                            : (entry.legal_references || []).slice(0, 4).map((ref: string, i: number) => (
                                <span key={i} className="text-[10px] bg-mint-400/10 text-mint-400 px-2 py-0.5 rounded-full border border-mint-400/20">
                                  {ref}
                                </span>
                              ))
                          }
                          {((entry.rights_pills?.length || entry.legal_references?.length) || 0) > 4 && (
                            <span className="text-[10px] text-slate-500 self-center">+{((entry.rights_pills?.length || entry.legal_references?.length) || 0) - 4} more</span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{entry.content}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contract Upload Section */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-bold text-white">Your contract</h2>
        </div>

        {dispute.contract_extractions && dispute.contract_extractions.length > 0 ? (
          <div>
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 mb-3">
              <p className="text-sm text-white font-medium mb-2">Here&apos;s what we found in your contract</p>
              <p className="text-xs text-slate-400 mb-3">{dispute.contract_extractions[0].raw_summary}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { label: 'Minimum term', value: dispute.contract_extractions[0].minimum_term },
                  { label: 'Notice period', value: dispute.contract_extractions[0].notice_period },
                  { label: 'Cancellation fee', value: dispute.contract_extractions[0].cancellation_fee },
                  { label: 'Early exit fee', value: dispute.contract_extractions[0].early_exit_fee },
                  { label: 'Price increases', value: dispute.contract_extractions[0].price_increase_clause },
                  { label: 'Auto-renewal', value: dispute.contract_extractions[0].auto_renewal },
                  { label: 'Cooling-off period', value: dispute.contract_extractions[0].cooling_off_period },
                ].filter(t => t.value).map((term) => (
                  <div key={term.label} className="bg-navy-950 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">{term.label}</p>
                    <p className="text-xs text-slate-300">{term.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {dispute.contract_extractions[0].unfair_clauses && dispute.contract_extractions[0].unfair_clauses.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-3">
                <p className="text-sm text-red-400 font-medium mb-2">Potentially unfair clauses found</p>
                <ul className="text-xs text-slate-400 space-y-1">
                  {dispute.contract_extractions[0].unfair_clauses.map((clause: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertCircle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                      {clause}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-slate-500">
              <CheckCircle className="h-3 w-3 text-mint-400 inline mr-1" />
              These terms will be used to strengthen your next letter
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-400 mb-3">
              Got a copy of your contract? Upload it and we&apos;ll find the clauses that help your case.
            </p>
            <label className={`flex items-center gap-3 w-full px-4 py-3 bg-navy-950 border border-dashed border-purple-500/30 rounded-lg text-slate-400 hover:border-purple-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm ${contractUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {contractUploading ? (
                <Loader2 className="h-5 w-5 text-purple-400 animate-spin flex-shrink-0" />
              ) : (
                <Upload className="h-5 w-5 text-purple-400 flex-shrink-0" />
              )}
              <span>{contractUploading ? 'Analysing your contract...' : 'Upload contract (PDF or photo)'}</span>
              <input
                type="file"
                accept="image/*,.pdf,.heic,.heif"
                className="sr-only"
                disabled={contractUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum 10MB.'); return; }
                  setContractUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('disputeId', disputeId);
                    const res = await fetch('/api/contracts/analyse', { method: 'POST', body: fd });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err.error || 'Analysis failed');
                    }
                    fetchDispute();
                  } catch (err: any) {
                    alert(err.message || 'Failed to analyse contract. Please try again.');
                  } finally {
                    setContractUploading(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <p className="text-[11px] text-slate-600 mt-2">We scan the contract, extract key terms, and flag anything unfair. The file is stored securely.</p>
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="bg-mint-400/5 border border-mint-400/20 rounded-xl px-4 py-3">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-mint-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-400">
            <strong className="text-mint-400">Tip:</strong> Add the company&apos;s replies to your thread. The more context our AI has, the stronger your next letter will be. Every response they send gives us more ammunition.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// New Dispute Form
// ============================================================
function NewDisputeForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    issue_type: searchParams.get('type') || 'complaint',
    provider_name: searchParams.get('company') || '',
    issue_summary: searchParams.get('issue') || '',
    desired_outcome: searchParams.get('outcome') || '',
    disputed_amount: searchParams.get('amount') || '',
    account_number: '',
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [incidentDate, setIncidentDate] = useState('');
  const [previousContact, setPreviousContact] = useState('');
  const [uploadedBillContext, setUploadedBillContext] = useState<string | null>(null);
  const [uploadedBillName, setUploadedBillName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loadingCaption, setLoadingCaption] = useState(0);

  const LOADING_CAPTIONS = [
    { icon: '📚', text: 'Reading up on UK consumer law...' },
    { icon: '⚖️', text: 'Finding the exact legislation that protects you...' },
    { icon: '🔍', text: 'Analysing your situation for maximum impact...' },
    { icon: '✍️', text: 'Writing a letter that would make a lawyer jealous...' },
    { icon: '💪', text: 'Making your complaint impossible to ignore...' },
    { icon: '🎯', text: 'Citing the sections they hope you never read...' },
    { icon: '📝', text: 'Politely but firmly demanding what you are owed...' },
    { icon: '🧠', text: 'Our AI has read more consumer law than their entire legal team...' },
    { icon: '⏱️', text: 'What would take a solicitor 2 hours takes us 30 seconds...' },
    { icon: '🏆', text: 'Putting the "back" in Paybacker...' },
  ];

  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number | null; tier: string } | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; used: number; limit: number; tier: string }>({
    open: false, used: 0, limit: 3, tier: 'free',
  });

  useEffect(() => {
    fetch('/api/complaints/usage')
      .then((r) => r.json())
      .then((data) => { if (!data.error) setUsageInfo(data); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.provider_name || !formData.issue_summary || !formData.desired_outcome) return;

    setSaving(true);
    try {
      // 1. Create the dispute
      const disputeRes = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!disputeRes.ok) throw new Error('Failed to create dispute');
      const dispute = await disputeRes.json();

      // 2. Upload contract if provided (non-blocking)
      if (contractFile) {
        try {
          const cfd = new FormData();
          cfd.append('file', contractFile);
          cfd.append('disputeId', dispute.id);
          await fetch('/api/contracts/analyse', { method: 'POST', body: cfd });
        } catch {
          // Non-blocking
        }
      }

      // 3. Generate first letter
      setGenerating(true);
      setLoadingCaption(0);
      const captionTimer = setInterval(() => setLoadingCaption(prev => (prev + 1) % LOADING_CAPTIONS.length), 3000);

      try {
        const genRes = await fetch('/api/complaints/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: formData.provider_name,
            issueDescription: formData.issue_summary,
            desiredOutcome: formData.desired_outcome,
            amount: formData.disputed_amount,
            accountNumber: formData.account_number,
            incidentDate,
            previousContact,
            letterType: formData.issue_type,
            disputeId: dispute.id,
            ...(uploadedBillContext ? { billContext: uploadedBillContext } : {}),
          }),
        });
        const genData = await genRes.json();
        if (genRes.status === 403 && genData.upgradeRequired) {
          setUpgradeModal({ open: true, used: genData.used, limit: genData.limit, tier: genData.tier });
        }
      } catch {
        // Non-blocking: dispute still created
      } finally {
        clearInterval(captionTimer);
        setGenerating(false);
      }

      capture('dispute_created', { company: formData.provider_name, type: formData.issue_type });
      onCreated(dispute.id);
    } catch (error) {
      alert('Failed to start dispute. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBillUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum 10MB.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    setScanning(true);
    try {
      const res = await fetch('/api/receipts/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.provider_name) {
        const prov = (data.provider_name || '').toLowerCase();
        let detectedType = 'complaint';
        if (/british gas|eon|octopus|ovo|edf|scottish power|energy|gas|electric/i.test(prov)) detectedType = 'energy_dispute';
        else if (/sky|virgin media|bt|broadband|vodafone|ee|three|o2|mobile/i.test(prov)) detectedType = 'broadband_complaint';
        else if (/hmrc|tax|revenue/i.test(prov)) detectedType = 'hmrc_tax_rebate';
        else if (/council/i.test(prov)) detectedType = 'council_tax_band';
        else if (/nhs|hospital|gp/i.test(prov)) detectedType = 'nhs_complaint';
        else if (/dvla/i.test(prov)) detectedType = 'dvla_vehicle';
        else if (/parking|pcn/i.test(prov)) detectedType = 'parking_appeal';

        const lineItems = data.extracted_data?.line_items?.map((li: any) => `${li.description}: £${li.amount}`).join(', ') || '';
        const fullContext = `Scanned bill from ${data.provider_name || 'provider'} for £${data.amount || '?'} dated ${data.receipt_date || 'unknown'}. ${lineItems ? `Line items: ${lineItems}.` : ''} ${data.extracted_data?.reference_number ? `Reference: ${data.extracted_data.reference_number}.` : ''}`;

        setUploadedBillContext(fullContext);
        setUploadedBillName(file.name);
        setFormData(prev => ({
          ...prev,
          issue_type: detectedType,
          provider_name: data.provider_name || prev.provider_name || '',
          disputed_amount: String(data.amount || prev.disputed_amount || ''),
          account_number: data.reference_number || data.extracted_data?.account_number || prev.account_number || '',
        }));
        if (data.receipt_date) setIncidentDate(data.receipt_date);
      }
    } catch {
      alert('Upload failed. Please type the details manually.');
    } finally {
      setScanning(false);
    }
  };

  if (generating) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-12 text-center">
          <div className="relative mx-auto w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-navy-700" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-mint-400 animate-spin" />
            <span className="absolute inset-0 flex items-center justify-center text-3xl">
              {LOADING_CAPTIONS[loadingCaption].icon}
            </span>
          </div>
          <p className="text-white font-semibold text-lg mb-2">{LOADING_CAPTIONS[loadingCaption].text}</p>
          <p className="text-slate-500 text-sm">This usually takes 15-30 seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <UpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal((m) => ({ ...m, open: false }))}
        used={upgradeModal.used}
        limit={upgradeModal.limit}
        tier={upgradeModal.tier}
      />

      <button onClick={onCancel} className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm transition-all">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-1 font-[family-name:var(--font-heading)]">Start a new dispute</h2>
        <p className="text-slate-400 text-sm mb-6">Tell us what happened and we will write the perfect response</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">What type of issue?</label>
            <select
              value={formData.issue_type}
              onChange={(e) => setFormData({ ...formData, issue_type: e.target.value })}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
            >
              {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Who is it with? *</label>
            <input
              type="text"
              required
              value={formData.provider_name}
              onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
              placeholder="e.g. British Gas, Sky, Virgin Media"
            />
          </div>

          {/* Bill upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Got a bill to dispute? <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <p className="text-[11px] text-slate-600 mb-2">Files are scanned by AI then immediately deleted. We never store your uploads.</p>
            <label className="flex items-center gap-3 w-full px-4 py-3 bg-navy-950 border border-dashed border-navy-700/50 rounded-lg text-slate-500 hover:border-mint-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm">
              <Upload className="h-5 w-5 text-mint-400 flex-shrink-0" />
              <span>{scanning ? 'Scanning bill...' : 'Upload a photo or PDF of the bill'}</span>
              <input
                type="file"
                accept="image/*,.pdf,.heic,.heif"
                className="sr-only"
                disabled={scanning}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBillUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {uploadedBillContext && (
              <div className="mt-2 flex items-center justify-between bg-mint-400/10 border border-mint-400/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-mint-400 flex-shrink-0" />
                  <div>
                    <p className="text-mint-400 text-xs font-medium">Bill scanned</p>
                    <p className="text-slate-500 text-[10px]">{uploadedBillName}</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setUploadedBillContext(null); setUploadedBillName(null); }} className="text-slate-500 hover:text-white text-xs ml-2">Remove</button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">What happened? *</label>
            <textarea
              required
              rows={4}
              value={formData.issue_summary}
              onChange={(e) => setFormData({ ...formData, issue_summary: e.target.value })}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
              placeholder="Explain what went wrong, when it happened, and any impact on you. Paste email content here too."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">What outcome do you want? *</label>
            <input
              type="text"
              required
              value={formData.desired_outcome}
              onChange={(e) => setFormData({ ...formData, desired_outcome: e.target.value })}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
              placeholder="e.g. Full refund, £200 compensation, contract cancellation"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Amount (£)</label>
              <input
                type="text"
                value={formData.disputed_amount}
                onChange={(e) => setFormData({ ...formData, disputed_amount: e.target.value })}
                className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                placeholder="150.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Account number</label>
              <input
                type="text"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                placeholder="12345678"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Incident date</label>
            <input
              type="date"
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
            />
          </div>

          {/* Contract upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Got a copy of your contract? <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <p className="text-[11px] text-slate-600 mb-2">We&apos;ll find the clauses that strengthen your case</p>
            {contractFile ? (
              <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-400" />
                  <div>
                    <p className="text-purple-400 text-xs font-medium">Contract attached</p>
                    <p className="text-slate-500 text-[10px]">{contractFile.name}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setContractFile(null)} className="text-slate-500 hover:text-white text-xs ml-2">Remove</button>
              </div>
            ) : (
              <label className="flex items-center gap-3 w-full px-4 py-3 bg-navy-950 border border-dashed border-purple-500/30 rounded-lg text-slate-500 hover:border-purple-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm">
                <Shield className="h-5 w-5 text-purple-400 flex-shrink-0" />
                <span>Upload contract (PDF or photo)</span>
                <input
                  type="file"
                  accept="image/*,.pdf,.heic,.heif"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum 10MB.'); return; }
                      setContractFile(file);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {usageInfo && usageInfo.limit !== null && (
            <p className="text-xs text-slate-500 text-right">
              {usageInfo.used} of {usageInfo.limit} letters used this month
              {usageInfo.used >= usageInfo.limit && <span className="text-mint-400 ml-1">— upgrade for unlimited</span>}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="px-6 py-4 bg-navy-800 hover:bg-navy-700 text-slate-300 rounded-lg transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-mint-400 to-mint-500 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold py-4 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className="h-5 w-5" />
              {saving ? 'Starting dispute...' : 'Start dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Guided Tour
// ============================================================
const TOUR_STEPS = [
  { target: 'tour-new-btn', title: 'Start here', text: "Tell us about any company that's treating you unfairly" },
  { target: 'tour-list', title: 'Track every dispute', text: 'Each dispute tracks your whole conversation with a company' },
  { target: 'tour-how', title: 'AI-powered responses', text: 'Our AI writes responses that cite the exact law that protects you' },
  { target: 'tour-card', title: 'Build your argument', text: "Add their replies and we'll write even stronger follow-ups" },
];

function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [skippedSteps, setSkippedSteps] = useState(new Set<number>());

  useEffect(() => {
    // Small delay to let DOM settle after render
    const timer = setTimeout(() => {
      const el = document.getElementById(TOUR_STEPS[step].target);
      if (el) {
        setRect(el.getBoundingClientRect());
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Target doesn't exist — skip to next available step
        setSkippedSteps(prev => new Set(prev).add(step));
        const nextStep = findNextValidStep(step);
        if (nextStep !== null) {
          setStep(nextStep);
        } else {
          onComplete();
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function findNextValidStep(from: number): number | null {
    for (let i = from + 1; i < TOUR_STEPS.length; i++) {
      if (document.getElementById(TOUR_STEPS[i].target)) return i;
    }
    return null;
  }

  const handleNext = () => {
    const next = findNextValidStep(step);
    if (next !== null) setStep(next);
    else onComplete();
  };

  if (!rect) return null;

  const padding = 8;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Dark backdrop with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - padding}
              y={rect.top - padding}
              width={rect.width + padding * 2}
              height={rect.height + padding * 2}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#tour-mask)" />
      </svg>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="absolute z-[101] bg-navy-800 border border-mint-400/30 rounded-xl p-4 shadow-2xl max-w-[280px]"
          style={{
            top: rect.bottom + 12,
            left: Math.min(Math.max(rect.left, 16), window.innerWidth - 296),
          }}
        >
          <p className="text-mint-400 text-sm font-semibold mb-1">{TOUR_STEPS[step].title}</p>
          <p className="text-slate-300 text-sm mb-3">{TOUR_STEPS[step].text}</p>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${i <= step ? 'bg-mint-400' : 'bg-navy-600'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={onComplete} className="text-slate-500 hover:text-slate-300 text-xs transition-all">Skip</button>
              <button onClick={handleNext} className="bg-mint-400 hover:bg-mint-500 text-navy-950 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all">
                {step === TOUR_STEPS.length - 1 ? 'Got it' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Disputes List — main view
// ============================================================
function DisputesList({ onSelect, onNew }: { onSelect: (id: string) => void; onNew: () => void }) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    fetch('/api/disputes')
      .then((r) => r.json())
      .then(setDisputes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Check if user has seen the tour
  useEffect(() => {
    if (loading) return;
    if (localStorage.getItem('hasSeenComplaintsTooltip') === 'true') return;

    const checkTour = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const profile = await res.json();
          if (!profile.has_seen_disputes_tour) {
            setShowTour(true);
          } else {
            localStorage.setItem('hasSeenComplaintsTooltip', 'true');
          }
        }
      } catch {}
    };
    checkTour();
  }, [loading]);

  const completeTour = async () => {
    setShowTour(false);
    localStorage.setItem('hasSeenComplaintsTooltip', 'true');
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ has_seen_disputes_tour: true }),
      });
    } catch {}
  };

  return (
    <div className="max-w-5xl">
      {showTour && <GuidedTour onComplete={completeTour} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold text-white font-[family-name:var(--font-heading)]">AI Letters</h1>
          <p className="text-slate-400 mt-1">Your complaints and compensation disputes</p>
        </div>
        <button
          id="tour-new-btn"
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg transition-all"
        >
          <Plus className="h-4 w-4" />
          New dispute
        </button>
      </div>

      {/* How it works */}
      <div id="tour-how" className="bg-navy-900 border border-navy-700/50 rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold text-mint-400 uppercase tracking-wide mb-3">How it works</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <p className="text-slate-300 text-sm">Tell us what happened — in plain English, no legal knowledge needed</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <p className="text-slate-300 text-sm">Our AI writes the perfect response citing the exact law that protects you</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
            <p className="text-slate-300 text-sm">Add their replies and we write even stronger follow-ups — every response builds your argument</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-mint-400" />
        </div>
      ) : disputes.length === 0 ? (
        <div id="tour-list" className="bg-navy-900 border border-navy-700/50 rounded-2xl p-12 text-center">
          <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">No disputes yet</p>
          <p className="text-slate-500 text-sm mb-6">Start your first dispute and we will write the perfect complaint letter</p>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-2 px-6 py-3 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg transition-all"
          >
            <Plus className="h-4 w-4" /> Start a dispute
          </button>
        </div>
      ) : (
        <div id="tour-list" className="space-y-3">
          {disputes.map((d, idx) => {
            const statusConf = STATUS_CONFIG[d.status] || { label: d.status, className: 'bg-slate-500/10 text-slate-400' };
            return (
              <button
                key={d.id}
                id={idx === 0 ? 'tour-card' : undefined}
                onClick={() => onSelect(d.id)}
                className="w-full text-left bg-navy-900 border border-navy-700/50 rounded-2xl p-6 hover:border-mint-400/30 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold mb-1 truncate">{d.provider_name}</h3>
                    <p className="text-slate-400 text-sm truncate">{d.issue_summary}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-slate-500 text-xs">{ISSUE_TYPE_LABELS[d.issue_type] || d.issue_type}</span>
                      <span className="text-slate-600 text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {timeAgo(d.last_activity)}
                      </span>
                      {d.message_count > 0 && (
                        <span className="text-slate-500 text-xs flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {d.message_count} {d.message_count === 1 ? 'message' : 'messages'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    {d.disputed_amount && d.disputed_amount > 0 && (
                      <span className="text-mint-400 font-semibold">£{d.disputed_amount}</span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusConf.className}`}>
                      {statusConf.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page — routes between views
// ============================================================
function ComplaintsPageInner() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);

  // If URL has ?new=1, open new dispute form
  useEffect(() => {
    if (searchParams.get('new') === '1') setView('new');
  }, [searchParams]);

  if (view === 'new') {
    return (
      <NewDisputeForm
        onCreated={(id) => { setSelectedDisputeId(id); setView('detail'); }}
        onCancel={() => setView('list')}
      />
    );
  }

  if (view === 'detail' && selectedDisputeId) {
    return (
      <DisputeDetail
        disputeId={selectedDisputeId}
        onBack={() => { setView('list'); setSelectedDisputeId(null); }}
      />
    );
  }

  return (
    <DisputesList
      onSelect={(id) => { setSelectedDisputeId(id); setView('detail'); }}
      onNew={() => setView('new')}
    />
  );
}

export default function ComplaintsPage() {
  return (
    <Suspense>
      <ComplaintsPageInner />
    </Suspense>
  );
}
