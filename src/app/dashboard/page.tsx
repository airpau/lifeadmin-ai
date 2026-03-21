'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, Clock, CheckCircle, Sparkles } from 'lucide-react';

interface Stats {
  moneySaved: number;
  activeTasks: number;
  completedTasks: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    moneySaved: 0,
    activeTasks: 0,
    completedTasks: 0,
  });
  const [recentWins, setRecentWins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Sync subscription after Stripe checkout redirect
  useEffect(() => {
    if (searchParams.get('success') === 'true' || searchParams.get('upgraded')) {
      fetch('/api/stripe/sync', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.synced && data.tier && data.tier !== 'free') {
            setSyncMessage(`Welcome to Paybacker ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)}!`);
            setTimeout(() => setSyncMessage(null), 5000);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Fetch profile stats
          const { data: profile } = await supabase
            .from('profiles')
            .select('total_money_recovered, total_tasks_completed')
            .eq('id', user.id)
            .single();

          // Fetch active tasks count
          const { count: activeCount } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['pending_review', 'in_progress', 'awaiting_response']);

          // Fetch recent wins
          const { data: wins } = await supabase
            .from('tasks')
            .select('title, money_recovered, resolved_at, provider_name')
            .eq('user_id', user.id)
            .eq('status', 'resolved_success')
            .order('resolved_at', { ascending: false })
            .limit(5);

          setStats({
            moneySaved: profile?.total_money_recovered || 0,
            activeTasks: activeCount || 0,
            completedTasks: profile?.total_tasks_completed || 0,
          });

          setRecentWins(wins || []);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Subscription sync message */}
      {syncMessage && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-medium flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {syncMessage}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Overview</h1>
        <p className="text-slate-400">Track your money recovery and active tasks</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Money Saved */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <span className="text-xs text-slate-500">This month</span>
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            £{stats.moneySaved.toFixed(2)}
          </h3>
          <p className="text-slate-400 text-sm">Money recovered</p>
        </div>

        {/* Active Tasks */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center">
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
            <span className="text-xs text-slate-500">In progress</span>
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {stats.activeTasks}
          </h3>
          <p className="text-slate-400 text-sm">Active tasks</p>
        </div>

        {/* Completed */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-blue-500" />
            </div>
            <span className="text-xs text-slate-500">All time</span>
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {stats.completedTasks}
          </h3>
          <p className="text-slate-400 text-sm">Tasks completed</p>
        </div>
      </div>

      {/* Recent Wins */}
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-500" />
          Recent Wins
        </h2>

        {recentWins.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4">No wins yet — let's get started!</p>
            <a
              href="/dashboard/complaints"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-6 py-3 rounded-lg transition-all"
            >
              Create your first complaint
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {recentWins.map((win, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-slate-950/50 rounded-lg border border-slate-800"
              >
                <div className="flex-1">
                  <h4 className="text-white font-medium mb-1">{win.title}</h4>
                  <p className="text-slate-400 text-sm">{win.provider_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-green-500 font-bold text-lg">
                    +£{win.money_recovered}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {new Date(win.resolved_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
