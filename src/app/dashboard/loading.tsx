import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
    </div>
  );
}
