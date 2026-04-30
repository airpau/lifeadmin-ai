import { TrendingDown } from 'lucide-react';

export default function SavingsSkeleton() {
  return (
    <div className="bg-gradient-to-r from-green-500/5 to-green-600/5 animate-pulse border border-green-500/10 rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <TrendingDown className="h-6 w-6 text-green-500/30" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-green-500/20 rounded w-32"></div>
          <div className="h-8 bg-green-500/20 rounded w-48"></div>
          <div className="h-3 bg-slate-700 rounded w-64 mt-1"></div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded-lg px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 bg-slate-700 rounded w-1/3"></div>
              <div className="h-3 bg-slate-100 rounded w-1/2"></div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
              <div className="h-4 bg-green-500/20 rounded w-24"></div>
              <div className="w-8 h-8 bg-green-500/10 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-4 bg-green-500/20 rounded w-32"></div>
    </div>
  );
}
