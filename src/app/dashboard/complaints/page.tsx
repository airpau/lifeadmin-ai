'use client';

import { useState } from 'react';
import { FileText, Sparkles, Download, Copy, CheckCircle } from 'lucide-react';

export default function ComplaintsPage() {
  const [formData, setFormData] = useState({
    companyName: '',
    issueDescription: '',
    desiredOutcome: '',
    amount: '',
    accountNumber: '',
    incidentDate: '',
    previousContact: '',
  });

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

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

      if (!res.ok) throw new Error('Failed to generate letter');

      const data = await res.json();
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

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Complaint Generator</h1>
        <p className="text-slate-400">
          AI-powered complaint letters citing UK consumer law
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
      </div>
    </div>
  );
}
