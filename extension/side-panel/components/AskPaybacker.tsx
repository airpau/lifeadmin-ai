import React, { useState, useRef, useEffect } from 'react'
import { askPaybacker, logAuditEvent } from '../../lib/paybacker-api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

const SUGGESTED_QUESTIONS = [
  'Am I getting a good deal on broadband?',
  'What subscriptions am I paying for?',
  'Show me my biggest monthly bills',
  'Have any of my prices gone up recently?',
  'Am I paying too much for insurance?',
]

export function AskPaybacker() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return

    const userMsg: Message = { role: 'user', content: question }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const { answer, sources } = await askPaybacker(question)
      setMessages(prev => [...prev, { role: 'assistant', content: answer, sources }])
      await logAuditEvent('question_asked', { question })
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not reach Paybacker right now. Please check your connection and try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuestion(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div>
            <div className="text-center py-6">
              <div className="text-3xl mb-2">💬</div>
              <div className="font-semibold text-sm mb-1">Ask Paybacker anything</div>
              <div className="text-xs text-gray-400">
                I have full context of your transactions and email history.
              </div>
            </div>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendQuestion(q)}
                  className="w-full text-left text-xs bg-navy-light border border-gray-700 hover:border-mint/50 rounded-lg p-2.5 text-gray-300 hover:text-white transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-mint text-navy font-medium'
                : 'bg-navy-light text-gray-200 border border-gray-700'
            }`}>
              {msg.content}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-600 text-gray-400 text-xs">
                  Sources: {msg.sources.join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-navy-light border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400">
              Thinking…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-navy-light">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances…"
            rows={1}
            className="flex-1 bg-navy-light border border-gray-700 focus:border-mint rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 resize-none outline-none transition-colors"
          />
          <button
            onClick={() => sendQuestion(input)}
            disabled={!input.trim() || loading}
            className="bg-mint text-navy px-3 py-2 rounded-lg font-semibold text-xs disabled:opacity-40 hover:bg-mint/90 transition-colors"
          >
            →
          </button>
        </div>
        <div className="text-xs text-gray-600 mt-1">Enter to send · Shift+Enter for newline</div>
      </div>
    </div>
  )
}
