import { Layers, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'process' | 'analysis';

interface GraphViewToggleProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function GraphViewToggle({ viewMode, setViewMode }: GraphViewToggleProps) {
  return (
    <div className="flex bg-white border border-zinc-200 shadow-sm rounded-md overflow-hidden text-xs font-medium text-zinc-700">
      <button 
        onClick={() => setViewMode('process')}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 transition-colors border-r border-zinc-200",
          viewMode === 'process' ? "bg-zinc-100 text-zinc-900" : "hover:bg-zinc-50 text-zinc-500"
        )}
      >
        <Layers className="w-3.5 h-3.5" />
        Process View
      </button>
      <button 
        onClick={() => setViewMode('analysis')}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 transition-colors",
          viewMode === 'analysis' ? "bg-zinc-100 text-zinc-900" : "hover:bg-zinc-50 text-zinc-500"
        )}
      >
        <Activity className="w-3.5 h-3.5" />
        Analysis View
      </button>
    </div>
  );
}
