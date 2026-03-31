'use client';

import { useState, useEffect } from 'react';
import { FileText, Loader2, Copy, Download, CheckCircle, Sparkles, RefreshCw, History, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const FORM_TYPES = [
  { key: 'hmrc_tax_rebate', label: 'HMRC Tax Rebate', icon: '💷', description: 'Claim back overpaid tax',
    situationPlaceholder: 'e.g. I was on emergency tax code for 3 months when I started a new job in September 2025. I believe I overpaid approximately £800 in income tax.',
    outcomePlaceholder: 'Full refund of overpaid income tax',
    refLabel: 'NI number or UTR', refPlaceholder: 'e.g. QQ 12 34 56 A or 1234567890' },
  { key: 'hmrc_tax_code', label: 'Tax Code Challenge', icon: '📊', description: 'Fix an incorrect tax code',
    situationPlaceholder: 'e.g. My tax code changed to BR when it should be 1257L. I only have one job and no outstanding tax debts.',
    outcomePlaceholder: 'Correct my tax code and refund any overpaid tax',
    refLabel: 'NI number or UTR', refPlaceholder: 'e.g. QQ 12 34 56 A or 1234567890' },
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

interface FormTask {
  id: string;
  title: string;
  description: string;
  created_at: string;
  letter?: string;
}

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
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [historyTasks, setHistoryTasks] = useState<FormTask[]>([]);
  const [selectedHistoryTask, setSelectedHistoryTask] = useState<FormTask | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const supabase = createClient();

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingHistory(false); return; }

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, description, created_at')
      .eq('user_id', user.id)
      .eq('type', 'government_form')
      .order('created_at', { ascending: false })
      .limit(50);

    setHistoryTasks(tasks || []);
    setLoadingHistory(false);
  };

  const loadTaskLetter = async (task: FormTask) => {
    const { data: runs } = await supabase
      .from('agent_runs')
      .select('output_data')
      .eq('task_id', task.id)
      .eq('agent_type', 'government_form_writer')
      .order('created_at', { ascending: false })
      .limit(1);

    const letter = runs?.[0]?.output_data?.letter || null;
    setSelectedHistoryTask({ ...task, letter });
  };

  useEffect(() => {
    loadHistory();
  }, []);

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
      {/* Redirect banner */}
      <div className="mb-6 bg-mint-400/10 border border-mint-400/30 rounded-xl p-4 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-mint-400 shrink-0" />
        <div>
          <p className="text-white font-semibold text-sm">These forms are now available in Disputes</p>
          <p className="text-slate-400 text-xs mt-0.5">
            All form types have been merged into the Disputes section for a simpler experience.{' '}
            <a href="/dashboard/complaints" className="text-mint-400 hover:text-mint-300 underline underline-offset-2 transition-all">Go to Disputes</a>
          </p>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Forms & Government Letters</h1>
        <p className="text-slate-400">Official regulatory forms and government letters. For company complaints, use the{' '}
          <a href="/dashboard/complaints" className="text-mint-400 hover:text-mint-300 underline underline-offset-2 transition-all">Complaints section</a>.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab('generate'); setResult(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'generate' ? 'bg-mint-400 text-navy-950' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
        >
          <Sparkles className="h-4 w-4" /> Generate
        </button>
        <button
          onClick={() => { setActiveTab('history'); loadHistory(); setSelectedHistoryTask(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-mint-400 text-navy-950' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
        >
          <History className="h-4 w-4" /> History ({historyTasks.length})
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && (
        <div>
          {loadingHistory ? (
            <div className="text-center py-12"><Loader2 className="h-8 w-8 text-mint-400 animate-spin mx-auto" /></div>
          ) : selectedHistoryTask ? (
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
              <button onClick={() => setSelectedHistoryTask(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1">
                ← Back to history
              </button>
              <h3 className="text-lg font-bold text-white mb-2">{selectedHistoryTask.title}</h3>
              <p className="text-slate-500 text-xs mb-4">{new Date(selectedHistoryTask.created_at).toLocaleString('en-GB')}</p>
              {selectedHistoryTask.letter ? (
                <div className="bg-navy-950 rounded-lg p-4 border border-navy-700/50">
                  <pre
                    className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed"
                    onCopy={(e) => {
                      const sel = window.getSelection();
                      if (!sel) return;
                      e.preventDefault();
                      e.clipboardData?.setData('text/plain', sel.toString());
                    }}
                  >{selectedHistoryTask.letter}</pre>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedHistoryTask.letter!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="mt-4 flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg text-sm"
                  >
                    {copied ? <><CheckCircle className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy Letter</>}
                  </button>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Letter content not available.</p>
              )}
            </div>
          ) : historyTasks.length === 0 ? (
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-12 text-center">
              <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 mb-2">No letters generated yet</p>
              <button onClick={() => setActiveTab('generate')} className="text-mint-400 text-sm">Generate your first letter</button>
            </div>
          ) : (
            <div className="space-y-2">
              {historyTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => loadTaskLetter(task)}
                  className="w-full text-left bg-navy-900 border border-navy-700/50 hover:border-mint-400/50 rounded-xl px-5 py-4 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium text-sm">{task.title}</p>
                      <p className="text-slate-500 text-xs mt-1">{task.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs shrink-0 ml-4">
                      <Clock className="h-3 w-3" />
                      {new Date(task.created_at).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && !result ? (
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
                      ? 'border-mint-400/50 bg-mint-400/5'
                      : 'border-navy-700/50 bg-navy-900 hover:border-navy-700/50'
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
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
            {selectedForm ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-mint-400" />
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
                          className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                          placeholder={formConfig?.situationPlaceholder || 'Explain what happened, when, and any relevant details...'}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">What outcome do you want? *</label>
                        <input
                          type="text" required value={desiredOutcome} onChange={(e) => setDesiredOutcome(e.target.value)}
                          className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                          placeholder={formConfig?.outcomePlaceholder || 'e.g. Refund, correction, compensation...'}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Amount (optional)</label>
                          <input
                            type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                            placeholder="£"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">{formConfig?.refLabel || 'Reference'} (optional)</label>
                          <input
                            type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
                            className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
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
                  className="w-full bg-gradient-to-r from-mint-400 to-mint-500 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      ) : activeTab === 'generate' ? (
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

          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 mb-6">
            <pre
              className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed"
              onCopy={(e) => {
                const sel = window.getSelection();
                if (!sel) return;
                e.preventDefault();
                e.clipboardData?.setData('text/plain', sel.toString());
              }}
            >{result.letter}</pre>
          </div>

          {result.legalReferences?.length > 0 && (
            <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Legal References</h3>
              <ul className="text-xs text-slate-400 space-y-1">
                {result.legalReferences.map((ref: string, i: number) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-mint-400">•</span> {ref}</li>
                ))}
              </ul>
            </div>
          )}

          {result.nextSteps?.length > 0 && (
            <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Next Steps</h3>
              <ol className="text-sm text-slate-300 space-y-2">
                {result.nextSteps.map((step: string, i: number) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-mint-400 font-bold">{i + 1}.</span> {step}</li>
                ))}
              </ol>
            </div>
          )}

          {result.estimatedSuccess && (
            <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Estimated success rate</span>
                <span className={`font-bold ${result.estimatedSuccess >= 70 ? 'text-green-400' : result.estimatedSuccess >= 50 ? 'text-mint-400' : 'text-red-400'}`}>
                  {result.estimatedSuccess}%
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 rounded-lg transition-all">
              {copied ? <><CheckCircle className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Letter</>}
            </button>
            <button onClick={handlePDF}
              className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-lg transition-all">
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
