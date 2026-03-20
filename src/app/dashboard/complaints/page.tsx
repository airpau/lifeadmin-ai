'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Sparkles, Download, Copy, CheckCircle, Clock, History } from 'lucide-react';
import UpgradeModal from '@/components/UpgradeModal';

interface Task {
  id: string;
  title: string;
  provider_name: string | null;
  disputed_amount: number | null;
  status: string;
  created_at: string;
  agent_runs: Array<{ output_data: any; created_at: string }>;
}

function ComplaintsPageInner() {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    companyName: searchParams.get('company') || '',
    issueDescription: searchParams.get('issue') || '',
    desiredOutcome: '',
    amount: searchParams.get('amount') || '',
    accountNumber: '',
    incidentDate: '',
    previousContact: '',
  });

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; used: number; limit: number; tier: string }>({
    open: false, used: 0, limit: 3, tier: 'free',
  });

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
  }, [result]); // refetch after generating

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setResult(null);

    try {
      const res = await fetch('/api/complaints/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.status === 403 && data.upgradeRequired) {
        setUpgradeModal({ open: true, used: data.used, limit: data.limit, tier: data.tier });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to generate letter');

      setResult(data);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to generate complaint letter. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (result?.letter) {
      navigator.clipboard.writeText(result.letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (result?.letter) {
      const blob = new Blob([result.letter], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `complaint-${formData.companyName.toLowerCase().replace(/\s+/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pending_review: { label: 'Pending', className: 'bg-amber-500/10 text-amber-500' },
      in_progress: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-400' },
      awaiting_response: { label: 'Awaiting Response', className: 'bg-purple-500/10 text-purple-400' },
      resolved_success: { label: 'Resolved', className: 'bg-green-500/10 text-green-500' },
      resolved_failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400' },
    };
    const config = map[status] || { label: status, className: 'bg-slate-500/10 text-slate-400' };
    return (
      <span className={`text-xs px-2 py-1 rounded font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="max-w-5xl">
      <UpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal((m) => ({ ...m, open: false }))}
        used={upgradeModal.used}
        limit={upgradeModal.limit}
        tier={upgradeModal.tier}
      />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Complaints</h1>
        <p className="text-slate-400">
          AI-powered complaint letters citing UK consumer law
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('generate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'generate' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Generate Letter
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'history' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <History className="h-4 w-4" />
          History ({tasks.length})
        </button>
      </div>

      {activeTab === 'history' && (
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-12 text-center">
              <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No complaints generated yet</p>
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold mb-1">{task.title}</h3>
                    {task.provider_name && (
                      <p className="text-slate-400 text-sm">{task.provider_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {task.disputed_amount && (
                      <span className="text-amber-500 font-semibold">£{task.disputed_amount}</span>
                    )}
                    {getStatusBadge(task.status)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="h-3 w-3" />
                  {new Date(task.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
                {task.agent_runs?.[0]?.output_data?.letter && (
                  <details className="mt-4">
                    <summary className="text-sm text-slate-400 cursor-pointer hover:text-white transition-all">
                      View generated letter
                    </summary>
                    <div className="mt-3 bg-slate-950 rounded-lg p-4 border border-slate-800 max-h-64 overflow-y-auto">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                        {task.agent_runs[0].output_data.letter}
                      </pre>
                    </div>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'generate' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            Complaint Details
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="e.g. British Gas, Sky, Virgin Media"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Describe the Issue *
              </label>
              <textarea
                required
                rows={4}
                value={formData.issueDescription}
                onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="Explain what went wrong, when it happened, and any impact on you..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                What Outcome Do You Want? *
              </label>
              <input
                type="text"
                required
                value={formData.desiredOutcome}
                onChange={(e) => setFormData({ ...formData, desiredOutcome: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="e.g. Full refund, £200 compensation, contract cancellation"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Amount (£)
                </label>
                <input
                  type="text"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="150.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="12345678"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Incident Date
              </label>
              <input
                type="date"
                value={formData.incidentDate}
                onChange={(e) => setFormData({ ...formData, incidentDate: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          </form>
        </div>

        {/* Result */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Generated Letter</h2>

          {!result ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                Fill in the form and click Generate to create your complaint letter
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Success Rate */}
              <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Estimated Success Rate</span>
                  <span className="text-2xl font-bold text-green-500">
                    {result.estimatedSuccess}%
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400"
                    style={{ width: `${result.estimatedSuccess}%` }}
                  />
                </div>
              </div>

              {/* Letter */}
              <div className="bg-slate-950 rounded-lg p-6 border border-slate-800 max-h-96 overflow-y-auto">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                  {result.letter}
                </pre>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg transition-all"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold py-3 rounded-lg transition-all"
                >
                  <Download className="h-5 w-5" />
                  Download
                </button>
              </div>

              {/* Legal References */}
              {result.legalReferences?.length > 0 && (
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
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
                <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                  <h3 className="text-sm font-semibold text-white mb-2">Next Steps</h3>
                  <ul className="text-xs text-slate-400 space-y-1">
                    {result.nextSteps.map((step: string, i: number) => (
                      <li key={i}>
                        {i + 1}. {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>}
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
