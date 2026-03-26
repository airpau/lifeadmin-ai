'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        // Use sessionStorage so chat clears on new browser session
        const saved = sessionStorage.getItem('pb_chat_history');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userTier, setUserTier] = useState<string>('free');
  const [escalatedTicket, setEscalatedTicket] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);

  // Auto-engage: show teaser bubble after 5 seconds on first visit
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = sessionStorage.getItem('pb_chat_teaser_dismissed');
    if (dismissed) return;

    const timer = setTimeout(() => {
      if (!open) setShowTeaser(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const check = () => setHidden(document.body.dataset.hideChat === 'true');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-hide-chat'] });
    return () => observer.disconnect();
  }, []);

  // Persist chat history to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        sessionStorage.setItem('pb_chat_history', JSON.stringify(messages));
      } catch {}
    }
  }, [messages]);

  // Fetch user's plan tier when chat opens
  useEffect(() => {
    if (open) {
      fetch('/api/stripe/sync', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.tier) setUserTier(d.tier); })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const distinctId = typeof window !== 'undefined' ? localStorage.getItem('pb_distinct_id') : null;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, tier: userTier, distinctId }),
      });

      const data = await res.json();
      setMessages([...updatedMessages, { role: 'assistant', content: data.reply }]);
      if (data.escalated && data.ticketNumber) {
        setEscalatedTicket(data.ticketNumber);
      }
    } catch {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
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

  if (hidden) return null;

  return (
    <>
      {/* Chat teaser bubble - auto-engages after 5 seconds */}
      {showTeaser && !open && (
        <div className="fixed bottom-36 right-6 z-50 max-w-[280px] md:bottom-24 animate-bounce-slow">
          <div className="bg-white text-slate-900 rounded-2xl rounded-br-sm shadow-xl p-4 relative">
            <button
              onClick={() => {
                setShowTeaser(false);
                sessionStorage.setItem('pb_chat_teaser_dismissed', '1');
              }}
              className="absolute -top-2 -right-2 bg-slate-200 hover:bg-slate-300 rounded-full w-5 h-5 flex items-center justify-center text-xs text-slate-500"
            >
              x
            </button>
            <p className="text-sm font-medium mb-2">Been overcharged on a bill?</p>
            <p className="text-xs text-slate-500 mb-3">I can generate a free complaint letter citing UK law in 30 seconds. Try me.</p>
            <button
              onClick={() => {
                setShowTeaser(false);
                sessionStorage.setItem('pb_chat_teaser_dismissed', '1');
                setOpen(true);
                setInput('I want to dispute a bill');
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold px-4 py-2 rounded-lg transition-all w-full"
            >
              Tell me more
            </button>
          </div>
        </div>
      )}

      {/* Chat button */}
      {!open && (
        <button
          onClick={() => {
            setShowTeaser(false);
            sessionStorage.setItem('pb_chat_teaser_dismissed', '1');
            setOpen(true);
          }}
          className="fixed bottom-20 right-6 z-50 bg-amber-500 hover:bg-amber-600 text-slate-950 w-14 h-14 rounded-full shadow-lg shadow-amber-500/25 flex items-center justify-center transition-all hover:scale-105 md:bottom-6"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[460px] max-h-[calc(100vh-6rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden md:bottom-6 md:right-6 md:h-[520px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={24} height={24} />
              <div>
                <p className="text-white text-sm font-semibold">Paybacker Support</p>
                <p className="text-green-400 text-xs">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setEscalatedTicket(null); sessionStorage.removeItem('pb_chat_history'); }}
                  className="text-slate-400 hover:text-white transition-all text-xs px-2 py-1 rounded hover:bg-slate-700"
                  title="Start new chat"
                >
                  New Chat
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white transition-all p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Image src="/logo.png" alt="Paybacker" width={40} height={40} className="mx-auto mb-3" />
                <p className="text-white font-medium mb-1">Hi there!</p>
                <p className="text-slate-400 text-sm mb-4">Ask me anything about Paybacker, UK consumer rights, or how to save money.</p>
                <div className="space-y-2">
                  {['How can Paybacker help me?', 'What are my consumer rights?', 'How do I cancel a subscription?', 'I have a feature suggestion'].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="block w-full text-left text-sm text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg px-3 py-2 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="space-y-2">
                      {msg.content.split('\n').filter(Boolean).map((line, j) => {
                        if (line.startsWith('- ') || line.startsWith('• ')) {
                          return <p key={j} className="pl-3 before:content-['•'] before:mr-2 before:text-amber-500">{line.replace(/^[-•]\s*/, '')}</p>;
                        }
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <p key={j} className="font-semibold text-white">{line.replace(/\*\*/g, '')}</p>;
                        }
                        return <p key={j}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl px-4 py-2.5">
                  <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                </div>
              </div>
            )}

            {escalatedTicket && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-400">
                Support ticket <span className="font-semibold">{escalatedTicket}</span> created. Our team will respond via email shortly.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Talk to human button */}
          {!escalatedTicket && messages.length >= 3 && (
            <div className="px-3 pb-1">
              <button
                onClick={async () => {
                  const distinctId = typeof window !== 'undefined' ? localStorage.getItem('pb_distinct_id') : null;
                  setLoading(true);
                  try {
                    const res = await fetch('/api/support/tickets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        subject: messages.find(m => m.role === 'user')?.content.slice(0, 100) || 'Support request',
                        description: 'User requested human support via chatbot.',
                        source: 'chatbot',
                        metadata: { conversation: messages, distinct_id: distinctId },
                      }),
                    });
                    const data = await res.json();
                    if (data.ticket?.ticket_number) {
                      setEscalatedTicket(data.ticket.ticket_number);
                      setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `I've created support ticket ${data.ticket.ticket_number}. Our team will get back to you via email as soon as possible.`,
                      }]);
                    }
                  } catch {
                    // silent fail
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full text-xs text-slate-400 hover:text-amber-400 py-1.5 transition-all"
              >
                Talk to a human instead
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-700">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 text-center mt-2">
              AI assistant — not legal advice
            </p>
          </div>
        </div>
      )}
    </>
  );
}
