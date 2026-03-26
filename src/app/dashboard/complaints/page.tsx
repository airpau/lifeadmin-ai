'use client';


import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, Sparkles, Download, Copy, CheckCircle, Clock, History, RotateCcw, RefreshCw, X, ThumbsUp, Pencil, Volume2, Loader2 } from 'lucide-react';
import { capture } from '@/lib/posthog';
import UpgradeModal from '@/components/UpgradeModal';
import ShareWinModal from '@/components/share/ShareWinModal';
import { shouldShowShareModal, hasSharedThisSession } from '@/lib/share-triggers';

interface Task {
  id: string;
  title: string;
  provider_name: string | null;
  disputed_amount: number | null;
  status: string;
  created_at: string;
  agent_runs: Array<{ output_data: any; created_at: string }>;
}

interface LetterModalProps {
  task: Task;
  onClose: () => void;
}

function LetterModal({ task, onClose }: LetterModalProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [letterContent, setLetterContent] = useState(task.agent_runs?.[0]?.output_data?.letter || '');
  const [editText, setEditText] = useState(letterContent);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  const handleListen = async () => {
    if (audioPlaying && audioRef) {
      audioRef.pause();
      setAudioPlaying(false);
      return;
    }

    setAudioLoading(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: letterContent }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Could not generate audio');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { setAudioPlaying(false); URL.revokeObjectURL(url); };
      setAudioRef(audio);
      audio.play();
      setAudioPlaying(true);
    } catch {
      alert('Audio generation failed. Please try again.');
    } finally {
      setAudioLoading(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const legalRefs = task.agent_runs?.[0]?.output_data?.legalReferences || [];
  const isApproved = task.status === 'approved';

  const handleCopy = () => {
    navigator.clipboard.writeText(letterContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Complaint Letter — ${task.provider_name || task.title}</title>
        <style>
          body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 0 40px; line-height: 1.8; color: #000; }
          pre { white-space: pre-wrap; font-family: 'Times New Roman', serif; font-size: 13px; line-height: 1.8; }
          h1 { font-size: 16px; margin-bottom: 24px; }
          .refs { margin-top: 24px; padding-top: 16px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
          @media print { body { margin: 20mm 25mm; } }
        </style>
      </head>
      <body>
        <pre>${letterContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        ${legalRefs.length > 0 ? `<div class="refs"><strong>Legal references:</strong> ${legalRefs.join(' · ')}</div>` : ''}
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleStartEdit = () => {
    setEditText(letterContent);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(letterContent);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/complaints/${task.id}/letter`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letter: editText }),
      });
      if (!res.ok) throw new Error('Save failed');
      setLetterContent(editText);
      setIsEditing(false);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch {
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Modal header */}
        <div className="flex items-start justify-between p-6 border-b border-navy-700/50 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">{task.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              {task.provider_name && (
                <span className="text-slate-400 text-sm">{task.provider_name}</span>
              )}
              {task.disputed_amount && (
                <span className="text-mint-400 text-sm font-semibold">£{task.disputed_amount}</span>
              )}
              <span className="text-slate-500 text-xs flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(task.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
              {isApproved && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Approved
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {!isEditing && letterContent && (
              <button
                onClick={handleStartEdit}
                className="text-slate-400 hover:text-white transition-all p-1"
                title="Edit letter"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-all p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Letter body */}
        <div className="flex-1 overflow-y-auto p-6">
          {letterContent ? (
            <>
              <div className="bg-navy-950 rounded-xl p-6 border border-navy-700/50 mb-4">
                {isEditing ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed bg-transparent resize-none outline-none min-h-[400px]"
                    autoFocus
                  />
                ) : (
                  <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">
                    {letterContent}
                  </pre>
                )}
              </div>

              {savedMsg && (
                <div className="text-sm text-green-400 flex items-center gap-2 mb-4">
                  <CheckCircle className="h-4 w-4" /> Saved ✓
                </div>
              )}

              {!isEditing && legalRefs.length > 0 && (
                <div className="bg-navy-950/50 rounded-lg p-4 border border-navy-700/50">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Legal References</h3>
                  <ul className="text-xs text-slate-400 space-y-1">
                    {legalRefs.map((ref: string, i: number) => (
                      <li key={i}>• {ref}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-500">No letter content available</div>
          )}
        </div>

        {/* Modal actions */}
        <div className="flex gap-3 p-6 border-t border-navy-700/50 flex-shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 rounded-lg transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 py-3 rounded-lg transition-all font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleListen}
                disabled={audioLoading || !letterContent}
                className="flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 px-4 rounded-lg transition-all font-medium disabled:opacity-50"
                title="Listen to your letter"
              >
                {audioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className={`h-4 w-4 ${audioPlaying ? 'text-mint-400' : ''}`} />}
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 rounded-lg transition-all font-medium"
              >
                {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Letter'}
              </button>
              <button
                onClick={handlePDF}
                className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 py-3 rounded-lg transition-all font-semibold"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ComplaintsPageInner() {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    letterType: searchParams.get('type') || 'complaint',
    companyName: searchParams.get('company') || '',
    issueDescription: searchParams.get('issue') || '',
    desiredOutcome: searchParams.get('outcome') || '',
    amount: searchParams.get('amount') || '',
    accountNumber: '',
    incidentDate: '',
    previousContact: '',
  });
  const [uploadedBillContext, setUploadedBillContext] = useState<string | null>(null);
  const [uploadedBillName, setUploadedBillName] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [loadingCaption, setLoadingCaption] = useState(0);

  const LOADING_CAPTIONS = [
    { icon: '📚', text: 'Reading up on UK consumer law...' },
    { icon: '⚖️', text: 'Finding the exact legislation that protects you...' },
    { icon: '🔍', text: 'Analysing your case for maximum impact...' },
    { icon: '✍️', text: 'Writing a letter that would make a lawyer jealous...' },
    { icon: '💪', text: 'Making your complaint impossible to ignore...' },
    { icon: '🎯', text: 'Citing the sections they hope you never read...' },
    { icon: '📝', text: 'Politely but firmly demanding what you are owed...' },
    { icon: '🧠', text: 'Our AI has read more consumer law than their entire legal team...' },
    { icon: '⏱️', text: 'What would take a solicitor 2 hours takes us 30 seconds...' },
    { icon: '🏆', text: 'Putting the "back" in Paybacker...' },
  ];
  const [result, setResult] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [letterApproved, setLetterApproved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; used: number; limit: number; tier: string }>({
    open: false, used: 0, limit: 3, tier: 'free',
  });
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number | null; tier: string } | null>(null);
  const [shareModal, setShareModal] = useState<{ open: boolean; amount: number; provider: string }>({ open: false, amount: 0, provider: '' });

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch('/api/tasks?type=complaint_letter');
        if (res.ok) setTasks(await res.json());
      } catch (e) {
        console.error(e);
      }
    };
    fetchTasks();
  }, [result]);

  useEffect(() => {
    fetch('/api/complaints/usage')
      .then((r) => r.json())
      .then((data) => { if (!data.error) setUsageInfo(data); })
      .catch(() => {});
  }, [result]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setResult(null);
    setShowFeedback(false);
    setFeedback('');
    setLetterApproved(false);
    setLoadingCaption(0);

    // Cycle through loading captions every 3 seconds
    const captionTimer = setInterval(() => {
      setLoadingCaption(prev => (prev + 1) % LOADING_CAPTIONS.length);
    }, 3000);
    (window as any).__captionTimer = captionTimer;

    try {
      const res = await fetch('/api/complaints/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          // Include scanned bill context as additional info for the AI
          ...(uploadedBillContext ? { billContext: uploadedBillContext } : {}),
        }),
      });

      const data = await res.json();

      if (res.status === 403 && data.upgradeRequired) {
        setUpgradeModal({ open: true, used: data.used, limit: data.limit, tier: data.tier });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to generate letter');
      setResult(data);
      capture('complaint_generated', { company: formData.companyName, amount: formData.amount });
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to generate complaint letter. Please try again.');
    } finally {
      setGenerating(false);
      clearInterval((window as any).__captionTimer);
    }
  };

  const clearForm = () => {
    setFormData({
      letterType: 'complaint', companyName: '', issueDescription: '', desiredOutcome: '',
      amount: '', accountNumber: '', incidentDate: '', previousContact: '',
    });
    setResult(null);
    setFeedback('');
    setShowFeedback(false);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/complaints/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, feedback, previousLetter: result?.letter }),
      });
      const data = await res.json();
      if (res.status === 403 && data.upgradeRequired) {
        setUpgradeModal({ open: true, used: data.used, limit: data.limit, tier: data.tier });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate');
      setResult(data);
      setFeedback('');
      setShowFeedback(false);
    } catch (error) {
      console.error('Regenerate error:', error);
      alert('Failed to regenerate. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = () => {
    if (result?.letter) {
      navigator.clipboard.writeText(result.letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePDF = () => {
    if (!result?.letter) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Complaint Letter — ${formData.companyName}</title>
        <style>
          body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 0 40px; line-height: 1.8; color: #000; }
          pre { white-space: pre-wrap; font-family: 'Times New Roman', serif; font-size: 13px; line-height: 1.8; }
          .refs { margin-top: 24px; padding-top: 16px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
          @media print { body { margin: 20mm 25mm; } }
        </style>
      </head>
      <body>
        <pre>${result.letter.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        ${result.legalReferences?.length > 0 ? `<div class="refs"><strong>Legal references:</strong> ${result.legalReferences.join(' · ')}</div>` : ''}
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pending_review: { label: 'Pending', className: 'bg-mint-400/10 text-mint-400' },
      in_progress: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-400' },
      awaiting_response: { label: 'Awaiting Response', className: 'bg-purple-500/10 text-purple-400' },
      resolved_success: { label: 'Resolved', className: 'bg-green-500/10 text-green-500' },
      resolved_failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400' },
    };
    const config = map[status] || { label: status, className: 'bg-navy-500/10 text-slate-400' };
    return (
      <span className={`text-xs px-2 py-1 rounded font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="max-w-5xl">
      {/* Letter detail modal */}
      {selectedTask && (
        <LetterModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}

      <UpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal((m) => ({ ...m, open: false }))}
        used={upgradeModal.used}
        limit={upgradeModal.limit}
        tier={upgradeModal.tier}
      />

      <ShareWinModal
        open={shareModal.open}
        onClose={() => setShareModal((m) => ({ ...m, open: false }))}
        amount={shareModal.amount}
        type="complaint"
        providerName={shareModal.provider}
      />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">AI Letters</h1>
        <p className="text-slate-400">AI-powered complaint letters citing UK consumer law</p>
      </div>

      {/* How it works / trust signal */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold text-mint-400 uppercase tracking-wide mb-3">How it works</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <p className="text-slate-300 text-sm">Tell us what happened — in plain English, no legal knowledge needed</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <p className="text-slate-300 text-sm">Our AI (trained on UK consumer law) drafts your formal complaint letter</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
            <p className="text-slate-300 text-sm">Every letter cites specific legislation: Consumer Rights Act 2015, Ofcom, FCA rules — making companies take it seriously</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('generate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'generate' ? 'bg-mint-400 text-navy-950' : 'bg-navy-800 text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Generate Letter
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'history' ? 'bg-mint-400 text-navy-950' : 'bg-navy-800 text-slate-400 hover:text-white'
          }`}
        >
          <History className="h-4 w-4" />
          History ({tasks.length})
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-12 text-center">
              <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No complaints generated yet</p>
            </div>
          ) : (
            tasks.map((task) => {
              const hasLetter = !!task.agent_runs?.[0]?.output_data?.letter;
              return (
                <button
                  key={task.id}
                  onClick={() => hasLetter && setSelectedTask(task)}
                  disabled={!hasLetter}
                  className={`w-full text-left bg-navy-900 backdrop-blur-sm border rounded-2xl p-6 transition-all ${
                    hasLetter
                      ? 'border-navy-700/50 hover:border-mint-400/50 hover:bg-navy-900 cursor-pointer'
                      : 'border-navy-700/50 opacity-60 cursor-default'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold mb-1 truncate">{task.title}</h3>
                      <div className="flex items-center gap-3 flex-wrap">
                        {task.provider_name && (
                          <span className="text-slate-400 text-sm">{task.provider_name}</span>
                        )}
                        <span className="text-slate-500 text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(task.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      {task.disputed_amount && (
                        <span className="text-mint-400 font-semibold">£{task.disputed_amount}</span>
                      )}
                      {getStatusBadge(task.status)}
                      {hasLetter && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          View
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Generate tab */}
      {activeTab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 font-[family-name:var(--font-heading)]">
              <FileText className="h-5 w-5 text-mint-400" />
              Complaint Details
            </h2>

            <div className="bg-mint-400/5 border border-mint-400/20 rounded-xl px-4 py-3 mb-4 space-y-1.5">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-mint-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-400">
                  Add your address and postcode in your{' '}
                  <Link href="/dashboard/profile" className="text-mint-400 hover:text-mint-300 underline">Profile</Link>
                  {' '}to auto-fill your details in generated letters.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">What type of letter?</label>
                <select
                  value={formData.letterType || 'complaint'}
                  onChange={(e) => setFormData({ ...formData, letterType: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                >
                  <option value="complaint">Company Complaint</option>
                  <option value="energy_dispute">Energy Bill Dispute</option>
                  <option value="broadband_complaint">Broadband / Mobile Complaint</option>
                  <option value="flight_compensation">Flight Delay Compensation (up to £520)</option>
                  <option value="parking_appeal">Parking Charge Appeal</option>
                  <option value="debt_dispute">Debt Dispute Response</option>
                  <option value="refund_request">Formal Refund Request</option>
                  <option value="hmrc_tax_rebate">HMRC Tax Rebate</option>
                  <option value="council_tax_band">Council Tax Band Challenge</option>
                  <option value="dvla_vehicle">DVLA Vehicle Issue</option>
                  <option value="nhs_complaint">NHS Complaint</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {formData.letterType === 'hmrc_tax_rebate' ? 'HMRC Office / Tax Office' :
                   formData.letterType === 'council_tax_band' ? 'Council Name' :
                   formData.letterType === 'dvla_vehicle' ? 'DVLA' :
                   formData.letterType === 'nhs_complaint' ? 'NHS Trust / GP Surgery' :
                   formData.letterType === 'flight_compensation' ? 'Airline Name' :
                   formData.letterType === 'parking_appeal' ? 'Parking Company / Council' :
                   formData.letterType === 'debt_dispute' ? 'Debt Collector / Creditor' :
                   'Company Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder={
                    formData.letterType === 'flight_compensation' ? 'e.g. British Airways, Ryanair, EasyJet' :
                    formData.letterType === 'parking_appeal' ? 'e.g. ParkingEye, NCP, Local Council' :
                    formData.letterType === 'hmrc_tax_rebate' ? 'e.g. HMRC' :
                    formData.letterType === 'council_tax_band' ? 'e.g. Winchester City Council' :
                    formData.letterType === 'nhs_complaint' ? 'e.g. Royal Hampshire County Hospital' :
                    'e.g. British Gas, Sky, Virgin Media'
                  }
                />
              </div>

              {/* Upload a bill */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Got a bill to dispute? <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <p className="text-[11px] text-slate-600 mb-2">Files are scanned by AI then immediately deleted. We never store your uploads.</p>
                <label className="flex items-center gap-3 w-full px-4 py-3 bg-navy-950 border border-dashed border-navy-700/50 rounded-lg text-slate-500 hover:border-mint-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm">
                  <svg className="h-5 w-5 text-mint-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>{generating ? 'Scanning bill...' : 'Upload a photo or PDF of the bill'}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.heic,.heif"
                    className="sr-only"
                    disabled={generating}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum 10MB.'); return; }

                      const fd = new FormData();
                      fd.append('file', file);

                      setGenerating(true);
                      setLoadingCaption(0);
                      const timer = setInterval(() => setLoadingCaption(prev => (prev + 1) % LOADING_CAPTIONS.length), 3000);

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

                          // Store bill context separately (not in the description field)
                          setUploadedBillContext(fullContext);
                          setUploadedBillName(file.name);

                          // Auto-fill fields extracted from the bill
                          setFormData(prev => ({
                            ...prev,
                            letterType: detectedType,
                            companyName: data.provider_name || prev.companyName || '',
                            amount: String(data.amount || prev.amount || ''),
                            accountNumber: data.extracted_data?.reference_number || prev.accountNumber || '',
                            incidentDate: data.receipt_date || prev.incidentDate || '',
                          }));
                        } else if (data.error) {
                          alert('Scan error: ' + data.error);
                        } else {
                          alert('Could not extract details. Please type them manually.');
                        }
                      } catch (err: any) {
                        alert('Upload failed: ' + (err.message || 'Please try again.'));
                      } finally {
                        setGenerating(false);
                        clearInterval(timer);
                        // Reset input for re-upload
                        e.target.value = '';
                      }
                    }}
                  />
                </label>

                {uploadedBillContext && (
                  <div className="mt-2 flex items-center justify-between bg-mint-400/10 border border-mint-400/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-mint-400 flex-shrink-0" />
                      <div>
                        <p className="text-mint-400 text-xs font-medium">Bill uploaded and scanned</p>
                        <p className="text-slate-500 text-[10px]">{uploadedBillName || 'Document'} - details extracted. File not stored.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUploadedBillContext(null); setUploadedBillName(null); }}
                      className="text-slate-500 hover:text-white text-xs ml-2"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Describe the Issue *</label>
                <textarea
                  required
                  rows={4}
                  value={formData.issueDescription}
                  onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder="Explain what went wrong, when it happened, and any impact on you. You can paste email content here too. Examples: debt recovery letters, billing disputes, service complaints, unfair charges..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">What Outcome Do You Want? *</label>
                <input
                  type="text"
                  required
                  value={formData.desiredOutcome}
                  onChange={(e) => setFormData({ ...formData, desiredOutcome: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder="e.g. Full refund, £200 compensation, contract cancellation"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount (£)</label>
                  <input
                    type="text"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                    placeholder="150.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Account Number</label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                    placeholder="12345678"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Incident Date</label>
                <input
                  type="date"
                  value={formData.incidentDate}
                  onChange={(e) => setFormData({ ...formData, incidentDate: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={clearForm}
                  className="flex items-center gap-2 px-4 py-4 bg-navy-800 hover:bg-navy-700 text-slate-300 rounded-lg transition-all"
                >
                  <RotateCcw className="h-4 w-4" />
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 bg-gradient-to-r from-mint-400 to-mint-500 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold py-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>Generating with AI...</>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Generate Complaint Letter
                    </>
                  )}
                </button>
              </div>

              {usageInfo && usageInfo.limit !== null && (
                <p className="text-xs text-slate-500 text-right">
                  {usageInfo.used} of {usageInfo.limit} letters used this month
                  {usageInfo.used >= usageInfo.limit && (
                    <span className="text-mint-400 ml-1">— upgrade for unlimited</span>
                  )}
                </p>
              )}
            </form>
          </div>

          {/* Result panel */}
          <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 font-[family-name:var(--font-heading)]">Generated Letter</h2>

            {generating ? (
              <div className="text-center py-16">
                <div className="relative mx-auto w-20 h-20 mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-navy-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-mint-400 animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">
                    {LOADING_CAPTIONS[loadingCaption].icon}
                  </span>
                </div>
                <p className="text-white font-semibold text-lg mb-2 transition-all duration-300">
                  {LOADING_CAPTIONS[loadingCaption].text}
                </p>
                <p className="text-slate-500 text-sm">This usually takes 15-30 seconds</p>
                <div className="flex justify-center gap-1.5 mt-6">
                  {LOADING_CAPTIONS.slice(0, 5).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        i <= loadingCaption % 5 ? 'bg-mint-400' : 'bg-navy-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : !result ? (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Fill in the form and click Generate to create your complaint letter</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Success Rate */}
                <div className="bg-navy-950/50 rounded-lg p-4 border border-navy-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Estimated Success Rate</span>
                    <span className="text-2xl font-bold text-green-500">{result.estimatedSuccess}%</span>
                  </div>
                  <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-green-400"
                      style={{ width: `${result.estimatedSuccess}%` }}
                    />
                  </div>
                </div>

                {/* Letter */}
                <div className="bg-navy-950 rounded-lg p-6 border border-navy-700/50 max-h-80 overflow-y-auto">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                    {result.letter}
                  </pre>
                </div>

                {/* Copy + PDF + Share */}
                <div className="flex gap-3">
                  <button
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 rounded-lg transition-all"
                  >
                    {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={handlePDF}
                    className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-lg transition-all"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                </div>

                {/* Share your win */}
                {(result.estimatedRefund || parseFloat(formData.amount)) > 0 &&
                  shouldShowShareModal('complaint', result.estimatedRefund || parseFloat(formData.amount)) &&
                  !hasSharedThisSession() && (
                  <button
                    onClick={() =>
                      setShareModal({
                        open: true,
                        amount: result.estimatedRefund || parseFloat(formData.amount),
                        provider: formData.companyName,
                      })
                    }
                    className="w-full flex items-center justify-center gap-2 bg-mint-400/10 hover:bg-mint-400/20 border border-mint-400/30 text-mint-400 py-3 rounded-lg transition-all text-sm font-medium"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    Share your win and earn 25 loyalty points
                  </button>
                )}

                {/* Satisfaction prompt */}
                {!showFeedback ? (
                  <div className="border border-navy-700/50 rounded-xl p-4">
                    {letterApproved ? (
                      <div className="flex items-center gap-2 text-green-400 text-sm font-medium py-1">
                        <CheckCircle className="h-4 w-4" />
                        Letter saved to your history
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-slate-300 font-medium mb-3">Happy with this letter?</p>
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              if (result?.taskId) {
                                await fetch(`/api/complaints/${result.taskId}/approve`, { method: 'PATCH' });
                              }
                              setLetterApproved(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 py-2.5 rounded-lg transition-all text-sm font-medium"
                          >
                            <ThumbsUp className="h-4 w-4" />
                            Yes, it&apos;s great
                          </button>
                          <button
                            onClick={() => setShowFeedback(true)}
                            className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-slate-300 py-2.5 rounded-lg transition-all text-sm font-medium"
                          >
                            <Pencil className="h-4 w-4" />
                            Request changes
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border border-navy-700/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-300 font-medium">What would you like changed?</p>
                      <button
                        onClick={() => { setShowFeedback(false); setFeedback(''); }}
                        className="text-slate-500 hover:text-white transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="e.g. Make it more formal, add more urgency about the billing error, mention the 8-week Ombudsman deadline..."
                      className="w-full px-3 py-2 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                    />
                    <p className="text-xs text-slate-500">Note: regenerating counts as 1 letter from your monthly quota.</p>
                    <button
                      onClick={handleRegenerate}
                      disabled={regenerating || !feedback.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
                      {regenerating ? 'Regenerating...' : 'Regenerate with Changes'}
                    </button>
                  </div>
                )}

                {/* Legal References */}
                {result.legalReferences?.length > 0 && (
                  <div className="bg-navy-950/50 rounded-lg p-4 border border-navy-700/50">
                    <h3 className="text-sm font-semibold text-white mb-2">Legal References</h3>
                    <ul className="text-xs text-slate-400 space-y-1">
                      {result.legalReferences.map((ref: string, i: number) => (
                        <li key={i}>• {ref}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Steps */}
                {result.nextSteps?.length > 0 && (
                  <div className="bg-navy-950/50 rounded-lg p-4 border border-navy-700/50">
                    <h3 className="text-sm font-semibold text-white mb-2">Next Steps</h3>
                    <ul className="text-xs text-slate-400 space-y-1">
                      {result.nextSteps.map((step: string, i: number) => (
                        <li key={i}>{i + 1}. {step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <Suspense>
      <ComplaintsPageInner />
    </Suspense>
  );
}
