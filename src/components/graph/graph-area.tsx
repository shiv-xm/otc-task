"use client";

import { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { ProcessGraphView } from './ProcessGraphView';
import { AnalysisGraphView } from './AnalysisGraphView';
import { GraphViewToggle, ViewMode } from './GraphViewToggle';

interface GraphAreaProps {
  isFullscreen?: boolean;
  toggleFullscreen?: () => void;
}

export function GraphArea({ isFullscreen = false, toggleFullscreen }: GraphAreaProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('process');

  return (
    <div className="flex-1 h-full relative bg-[#FAFAFA] flex flex-col overflow-hidden">
      {/* Universal Floating Controls */}
      <div className="absolute top-4 left-4 z-20 flex gap-2">
        <button 
          onClick={toggleFullscreen}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 shadow-sm rounded-md text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" /> 
              Minimize
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" /> 
              Maximize
            </>
          )}
        </button>
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <GraphViewToggle viewMode={viewMode} setViewMode={setViewMode} />
      </div>

      {/* Render selected view */}
      {viewMode === 'process' ? <ProcessGraphView /> : <AnalysisGraphView />}
    </div>
  );
}
