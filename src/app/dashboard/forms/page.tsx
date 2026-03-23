'use client';

import { useState } from 'react';
import { FileText, Loader2, Copy, Download, CheckCircle, Sparkles, RefreshCw } from 'lucide-react';

const FORM_TYPES = [
  { key: 'hmrc_tax_rebate', label: 'HMRC Tax Rebate', icon: '💷', description: 'Claim back overpaid tax',
    situationPlaceholder: 'e.g. I was on emergency tax code for 3 months when I started a new job in September 2025. I believe I overpaid approximately £800 in income tax.',
    outcomePlaceholder: 'Full refund of overpaid income tax',
    refLabel: 'National Insurance number', refPlaceholder: 'e.g. QQ 12 34 56 A' },
  { key: 'hmrc_tax_code', label: 'Tax Code Challenge', icon: '📊', description: 'Fix an incorrect tax code',
    situationPlaceholder: 'e.g. My tax code changed to BR when it should be 1257L. I only have one job and no outstanding tax debts.',
    outcomePlaceholder: 'Correct my tax code and refund any overpaid tax',
    refLabel: 'National Insurance number', refPlaceholder: 'e.g. QQ 12 34 56 A' },
  { key: 'council_tax_band', label: 'Council Tax Band Challenge', icon: '🏠', description: 'Challenge your council tax band',
    situationPlaceholder: 'e.g. My property is in Band D but similar houses on my street are in Band C. My house is a 3-bed semi built in 1985.',
    outcomePlaceholder: 'Reduce my council tax band to match comparable properties',
    refLabel: 'Council tax account number', refPlaceholder: 'e.g. 1234567890' },
  { key: 'council_tax_reduction', label: 'Council Tax Reduction', icon: '💰', description: 'Apply for discount or exemption',
    situationPlaceholder: 'e.g. I am the sole adult resident at my property and should qualify for the 25% single person discount.',
    outcomePlaceholder: '25% single person discount applied and backdated',
    refLabel: 'Council tax account number', refPlaceholder: 'e.g. 1234567890' },
  { key: 'dvla_vehicle', label: 'DVLA Vehicle Issue', icon: '🚗', description: 'Tax, registration, or SORN issues',
    situationPlaceholder: 'e.g. I declared SORN on my vehicle in January but received a fine for no road tax in February. The vehicle has been off the road the entire time.',
    outcomePlaceholder: 'Cancel the fine and confirm my SORN declaration',
    refLabel: 'Vehicle registration number', refPlaceholder: 'e.g. AB12 CDE' },
  { key: 'dvla_driving_licence', label: 'DVLA Driving Licence', icon: '🪪', description: 'Licence renewal, errors, or disputes',
    situationPlaceholder: 'e.g. I applied to renew my driving licence 8 weeks ago and have not received it. My current licence expired and I need it for work.',
    outcomePlaceholder: 'Expedite my licence renewal and issue a temporary licence',
    refLabel: 'Driving licence number', refPlaceholder: 'e.g. JONES 801125 AB1CD' },
  { key: 'nhs_complaint', label: 'NHS Complaint', icon: '🏥', description: 'Complain about NHS services',
    situationPlaceholder: 'e.g. I attended A&E on 15 March and waited 9 hours before being seen. I was in significant pain and was not triaged properly.',
    outcomePlaceholder: 'Formal investigation and written apology',
    refLabel: 'NHS number (optional)', refPlaceholder: 'e.g. 123 456 7890' },
  { key: 'parking_appeal', label: 'Parking Charge Appeal', icon: '🅿️', description: 'Appeal a private or council parking charge',
    situationPlaceholder: 'e.g. I received a parking charge notice for £100 at Tesco car park. I was inside the store the entire time but exceeded the 2-hour limit by 10 minutes due to long queues.',
    outcomePlaceholder: 'Cancel the parking charge notice',
    refLabel: 'PCN number', refPlaceholder: 'e.g. PCN-12345678' },
  { key: 'flight_compensation', label: 'Flight Delay Compensation', icon: '✈️', description: 'Claim up to £520 for flight delays',
    situationPlaceholder: 'e.g. My flight BA1234 from Heathrow to Barcelona on 10 March was delayed by 4 hours and 20 minutes. No extraordinary circumstances were announced.',
    outcomePlaceholder: 'Compensation of £350 under UK261 regulation',
    refLabel: 'Booking reference', refPlaceholder: 'e.g. ABC123' },
  { key: 'debt_dispute', label: 'Debt Dispute Response', icon: '⚖️', description: 'Respond to unfair debt recovery',
    situationPlaceholder: 'e.g. I received a letter from a debt collector claiming I owe £450 to a gym I cancelled 3 years ago. I have no record of this debt and it may be statute-barred.',
    outcomePlaceholder: 'Provide proof of the alleged debt or cease all contact',
    refLabel: 'Debt reference number', refPlaceholder: 'e.g. REF-12345' },
  { key: 'refund_request', label: 'Formal Refund Request', icon: '↩️', description: 'Request a refund citing consumer law',
    situationPlaceholder: 'e.g. I purchased a laptop for £899 from Currys on 1 March. It developed a fault within 2 weeks and they are refusing to refund.',
    outcomePlaceholder: 'Full refund under the 30-day right to reject',
    refLabel: 'Order or receipt number', refPlaceholder: 'e.g. ORD-12345678' },
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

                {(() => {
                  const formConfig = FORM_TYPES.find(f => f.key === selectedForm);
                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Describe your situation *</label>
                        <textarea
                          required rows={5} value={details} onChange={(e) => setDetails(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          placeholder={formConfig?.situationPlaceholder || 'Explain what happened, when, and any relevant details...'}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">What outcome do you want? *</label>
                        <input
                          type="text" required value={desiredOutcome} onChange={(e) => setDesiredOutcome(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          placeholder={formConfig?.outcomePlaceholder || 'e.g. Refund, correction, compensation...'}
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
                          <label className="block text-sm font-medium text-slate-300 mb-2">{formConfig?.refLabel || 'Reference'} (optional)</label>
                          <input
                            type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            placeholder={formConfig?.refPlaceholder || 'Reference number'}
                          />
                        </div>
                      </div>
                    </>
                  );
                })()}

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
