'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, CheckCircle, Trash2, Clock, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type PendingLetter = {
  id: string;
  dispute_id: string;
  letter_title: string;
  letter_text: string;
  status: string;
  created_at: string;
  disputes: {
    provider_name: string;
  } | null;
};

export default function PendingDisputeLettersCard() {
  const [letters, setLetters] = useState<PendingLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchPendingLetters();
  }, []);

  const fetchPendingLetters = async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase
        .from('pending_dispute_letters')
        .select(`
          id,
          dispute_id,
          letter_title,
          letter_text,
          status,
          created_at,
          disputes (
            provider_name
          )
        `)
        .eq('user_id', userData.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLetters(data as unknown as PendingLetter[]);
    } catch (err) {
      console.error('[PendingDisputeLettersCard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsSent = async (letter: PendingLetter) => {
    setProcessingId(letter.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const today = new Date();
      const titleStamp = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const title = letter.letter_title || `AI letter sent ${titleStamp}`;

      // Insert to correspondence
      const { error: insertErr } = await supabase.from('correspondence').insert({
        dispute_id: letter.dispute_id,
        user_id: userData.user.id,
        entry_type: 'ai_letter',
        title,
        content: letter.letter_text,
        summary: letter.letter_text.substring(0, 200),
        entry_date: today.toISOString(),
        detected_from_email: false,
      });

      if (insertErr) throw insertErr;

      // Bump dispute status
      const { data: current } = await supabase
        .from('disputes')
        .select('status')
        .eq('id', letter.dispute_id)
        .single();

      if (current?.status === 'open') {
        await supabase
          .from('disputes')
          .update({
            status: 'awaiting_response',
            last_letter_sent_at: today.toISOString(),
            last_reminder_sent: null,
            updated_at: today.toISOString(),
          })
          .eq('id', letter.dispute_id);
      } else {
        await supabase
          .from('disputes')
          .update({
            last_letter_sent_at: today.toISOString(),
            last_reminder_sent: null,
            updated_at: today.toISOString(),
          })
          .eq('id', letter.dispute_id);
      }

      // Mark pending letter as saved
      await supabase
        .from('pending_dispute_letters')
        .update({ status: 'saved', resolved_at: today.toISOString() })
        .eq('id', letter.id);

      // Optimistic update
      setLetters(letters.filter(l => l.id !== letter.id));
    } catch (err) {
      console.error('[PendingDisputeLettersCard] error marking as sent:', err);
      alert('Failed to save the letter. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const discardDraft = async (letterId: string) => {
    if (!confirm('Are you sure you want to discard this draft?')) return;
    
    setProcessingId(letterId);
    try {
      await supabase
        .from('pending_dispute_letters')
        .update({ status: 'discarded', resolved_at: new Date().toISOString() })
        .eq('id', letterId);
        
      setLetters(letters.filter(l => l.id !== letterId));
    } catch (err) {
      console.error('[PendingDisputeLettersCard] error discarding:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading && letters.length === 0) return null;
  if (letters.length === 0) return null;

  return (
    <div className="mb-6 space-y-4">
      {letters.map(letter => (
        <div key={letter.id} className="bg-orange-50 border border-orange-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-orange-100 p-2 rounded-lg mt-1 shrink-0">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  Draft ready for {letter.disputes?.provider_name || 'Provider'}
                </h3>
                <p className="text-sm text-gray-600 mt-1 max-w-xl">
                  Your Pocket Agent drafted a response for this dispute. Did you copy and send it? 
                  Confirming below logs it to your timeline so we can track the 14-day escalation deadline.
                </p>
                <div className="mt-3 bg-white border border-orange-100 p-3 rounded-lg text-sm text-gray-700 line-clamp-2 italic opacity-80">
                  "{letter.letter_text.substring(0, 150)}..."
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
              <button
                onClick={() => markAsSent(letter)}
                disabled={processingId === letter.id}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {processingId === letter.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Yes, I sent it
              </button>
              
              <button
                onClick={() => discardDraft(letter.id)}
                disabled={processingId === letter.id}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Discard
              </button>
              
              <Link
                href={`/dashboard/disputes?dispute=${letter.dispute_id}`}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                View Dispute <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
