'use client';

/**
 * BusinessChatWidget — the chat surface for /for-business and its subroutes.
 *
 * Separate from the consumer ChatWidget (different voice, different audience,
 * different API route, different prompt). Mounted by
 * src/app/for-business/layout.tsx ONLY — the consumer widget self-hides on
 * any path beginning /for-business so they never appear together.
 *
 * No subscription tools, no chart rendering, no dashboard commands — this is
 * a pre-sale technical Q&A surface for fintech / insurer engineering buyers
 * asking about the UK Consumer Rights API.
 */

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_QUESTIONS = [
  'How does the API work?',
  'What data do you return?',
  'How do I get an API key?',
  "What's the pricing?",
];

function renderAssistantMessage(content: string) {
  return content.split('\n').filter(Boolean).map((line, j) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <p key={j} className="pl-3 before:content-['•'] before:mr-2 before:text-[#f59e0b]">
          {line.replace(/^[-•]\s*/, '')}
        </p>
      );
    }
    if (line.startsWith('**') && line.endsWith('**')) {
      return <p key={j} className="font-semibold text-[#0a1628]">{line.replace(/\*\*/g, '')}</p>;
    }
    return <p key={j}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
  });
}

export default function BusinessChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('pb_b2b_chat_history');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        sessionStorage.setItem('pb_b2b_chat_history', JSON.stringify(messages));
      } catch {}
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMessage: Message = { role: 'user', content };
    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();
      setMessages([...updated, { role: 'assistant', content: data.reply || 'Sorry, something went wrong. Please try again.' }]);
    } catch {
      setMessages([
        ...updated,
        { role: 'assistant', content: 'Sorry, something went wrong. Please email business@paybacker.co.uk and we will reply within 24 hours.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
          style={{ background: '#0a1628', color: '#ffffff', boxShadow: '0 8px 24px rgba(10, 22, 40, 0.25)' }}
          aria-label="Open business chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-16 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden md:bottom-6 md:right-6 md:h-[540px] md:max-h-[calc(100vh-6rem)]">
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ background: '#0a1628', borderColor: '#0a1628' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: '#34d399', color: '#0a1628' }}
              >
                Pb
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Paybacker Business</p>
                <p className="text-[11px]" style={{ color: '#34d399' }}>API support · UK consumer-rights engine</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); sessionStorage.removeItem('pb_b2b_chat_history'); }}
                  className="text-slate-300 hover:text-white text-xs px-2 py-1 rounded transition-all"
                  title="Start new chat"
                >
                  New
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-white transition-all p-1"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold mx-auto mb-3"
                  style={{ background: '#0a1628', color: '#34d399' }}
                >
                  Pb
                </div>
                <p className="text-[#0a1628] font-semibold mb-1">Hi — engineering buyer?</p>
                <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                  I can answer questions about integrating our UK Consumer Rights API — request shape,
                  statute coverage, auth, webhooks, pricing, SLAs, and how to mint a free Starter key.
                </p>
                <div className="space-y-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="block w-full text-left text-sm rounded-lg px-3 py-2 transition-all border"
                      style={{
                        color: '#0a1628',
                        background: 'rgba(52, 211, 153, 0.08)',
                        borderColor: 'rgba(52, 211, 153, 0.35)',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user' ? '' : 'bg-slate-100 text-slate-800'
                  }`}
                  style={msg.role === 'user' ? { background: '#0a1628', color: '#ffffff' } : undefined}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="space-y-2">{renderAssistantMessage(msg.content)}</div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-slate-500 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Escape hatch to humans */}
          {messages.length >= 3 && (
            <div className="px-3 pb-1">
              <a
                href="mailto:business@paybacker.co.uk"
                className="block w-full text-center text-xs py-1.5 transition-all"
                style={{ color: '#0a1628' }}
              >
                Email business@paybacker.co.uk instead →
              </a>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the API…"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-[#0a1628] placeholder-slate-400 focus:outline-none"
                style={{ caretColor: '#0a1628' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#34d399'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#0a1628', color: '#34d399' }}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 text-center mt-2">
              Pre-sale Q&amp;A · not legal advice · not the live API
            </p>
          </div>
        </div>
      )}
    </>
  );
}
