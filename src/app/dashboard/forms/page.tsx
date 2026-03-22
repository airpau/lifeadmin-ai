'use client';

import { useState } from 'react';
import { FileText, Loader2, Copy, Download, CheckCircle, Sparkles, RefreshCw } from 'lucide-react';

const FORM_TYPES = [
  { key: 'hmrc_tax_rebate', label: 'HMRC Tax Rebate', icon: '💷', description: 'Claim back overpaid tax' },
  { key: 'hmrc_tax_code', label: 'Tax Code Challenge', icon: '📊', description: 'Fix an incorrect tax code' },
  { key: 'council_tax_band', label: 'Council Tax Band Challenge', icon: '🏠', description: 'Challenge your council tax band' },
  { key: 'council_tax_reduction', label: 'Council Tax Reduction', icon: '💰', description: 'Apply for discount or exemption' },
  { key: 'dvla_vehicle', label: 'DVLA Vehicle Issue', icon: '🚗', description: 'Tax, registration, or SORN issues' },
  { key: 'dvla_driving_licence', label: 'DVLA Driving Licence', icon: '🪪', description: 'Licence renewal, errors, or disputes' },
  { key: 'nhs_complaint', label: 'NHS Complaint', icon: '🏥', description: 'Complain about NHS services' },
  { key: 'parking_appeal', label: 'Parking Charge Appeal', icon: '🅿️', description: 'Appeal a private or council parking charge' },
  { key: 'flight_compensation', label: 'Flight Delay Compensation', icon: '✈️', description: 'Claim up to £520 for flight delays' },
  { key: 'debt_dispute', label: 'Debt Dispute Response', icon: '⚖️', description: 'Respond to unfair debt recovery' },
  { key: 'refund_request', label: 'Formal Refund Request', icon: '↩️', description: 'Request a refund citing consumer law' },
];

export default function FormsPage() {
  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!selectedForm || !details || !desiredOutcome) return;
    setGenerating(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/forms/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formType: selectedForm, details, desiredOutcome, amount, referenceNumber }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.upgradeRequired) {
          setError(`Monthly limit reached (${data.used}/${data.limit}). Upgrade to Essential for unlimited.`);
        } else {
          setError(data.error || 'Failed to generate. Please try again.');
        }
      } else {
        setResult(data);
      }
    } catch {
      setError('Something went wrong. Please try again.');
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

  const handlePDF = () => {
    if (!result?.letter) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${result.formType || 'Letter'}</title>
      <style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:0 40px;line-height:1.8}
      pre{white-space:pre-wrap;font-family:'Times New Roman',serif;font-size:13px;line-height:1.8}
      .refs{margin-top:24px;padding-top:16px;border-top:1px solid #ccc;font-size:11px;color:#555}
      @media print{body{margin:20mm 25mm}}</style></head><body>
      <pre>${result.letter.replace(/</g, '&lt;')}</pre>
      ${result.legalReferences?.length ? `<div class="refs"><strong>Legal references:</strong> ${result.legalReferences.join(' · ')}</div>` : ''}
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  const handleReset = () => {
    setSelectedForm(null);
    setDetails('');
    setDesiredOutcome('');
    setAmount('');
    setReferenceNumber('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Forms & Government Letters</h1>
        <p className="text-slate-400">Generate formal letters to HMRC, councils, DVLA, NHS, airlines, and more</p>
      </div>

      {!result ? (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form type selection */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">What do you need help with?</h2>
            <div className="space-y-2">
              {FORM_TYPES.map((form) => (
                <button
                  key={form.key}
                  onClick={() => setSelectedForm(form.key)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    selectedForm === form.key
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xl">{form.icon}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{form.label}</p>
                    <p className="text-slate-500 text-xs">{form.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Details form */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            {selectedForm ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-500" />
                  {FORM_TYPES.find(f => f.key === selectedForm)?.label}
                </h2>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Describe your situation *</label>
                  <textarea
                    required rows={5} value={details} onChange={(e) => setDetails(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="Explain what happened, when, and any relevant details. You can paste email or letter content here too..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">What outcome do you want? *</label>
                  <input
                    type="text" required value={desiredOutcome} onChange={(e) => setDesiredOutcome(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="e.g. Full refund of overpaid tax, Band reduction, Compensation..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Amount (optional)</label>
                    <input
                      type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      placeholder="£"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Reference (optional)</label>
                    <input
                      type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      placeholder="Tax ref, PCN number, etc."
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={generating || !details || !desiredOutcome}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate Letter</>}
                </button>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Select a letter type from the left to get started</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Result view */
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">{result.formType}</h2>
              <p className="text-green-400 text-sm flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Saved to your history</p>
            </div>
            <button onClick={handleReset} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-all">
              <RefreshCw className="h-4 w-4" /> New letter
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-6">
            <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">{result.letter}</pre>
          </div>

          {result.legalReferences?.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Legal References</h3>
              <ul className="text-xs text-slate-400 space-y-1">
                {result.legalReferences.map((ref: string, i: number) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-amber-500">•</span> {ref}</li>
                ))}
              </ul>
            </div>
          )}

          {result.nextSteps?.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Next Steps</h3>
              <ol className="text-sm text-slate-300 space-y-2">
                {result.nextSteps.map((step: string, i: number) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-amber-500 font-bold">{i + 1}.</span> {step}</li>
                ))}
              </ol>
            </div>
          )}

          {result.estimatedSuccess && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Estimated success rate</span>
                <span className={`font-bold ${result.estimatedSuccess >= 70 ? 'text-green-400' : result.estimatedSuccess >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {result.estimatedSuccess}%
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg transition-all">
              {copied ? <><CheckCircle className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Letter</>}
            </button>
            <button onClick={handlePDF}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold py-3 rounded-lg transition-all">
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
