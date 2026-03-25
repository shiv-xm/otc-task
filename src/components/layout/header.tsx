import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  isChatOpen: boolean;
  toggleChat: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

export function Header({ isChatOpen, toggleChat, isFullscreen, toggleFullscreen }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 h-14 border-b border-zinc-200 bg-white shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Breadcrumb / Title */}
          <span className="text-zinc-500 font-medium text-sm">Mapping</span>
          <span className="text-zinc-300">/</span>
          <h1 className="text-zinc-900 font-semibold text-sm">Order to Cash</h1>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-2 ml-4 px-2 py-1 bg-zinc-100 rounded-md">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          <span className="text-xs font-medium text-zinc-600">Connected</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-zinc-500">
        <button 
          onClick={toggleChat}
          className={cn(
            "p-1.5 rounded-md hover:bg-zinc-100 transition-colors",
            !isChatOpen && "bg-zinc-100 text-zinc-900 font-bold"
          )}
          title="Toggle Chat Panel"
        >
          {isChatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
