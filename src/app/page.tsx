"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { GraphArea } from "@/components/graph/graph-area";
import { NodeDetail } from "@/components/graph/node-detail";
import { cn } from "@/lib/utils";

export default function Home() {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className={cn(
      "flex flex-col bg-white overflow-hidden text-zinc-900 font-sans",
      isFullscreen ? "fixed inset-0 z-50 h-screen w-screen" : "h-screen w-full"
    )}>
      {/* Top Header - Hide in fullscreen for true immersive mode */}
      {!isFullscreen && (
        <Header
          isChatOpen={isChatOpen}
          toggleChat={() => setIsChatOpen(!isChatOpen)}
          isFullscreen={isFullscreen}
          toggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
      )}

      <div className="flex flex-1 overflow-hidden relative">

        <div className="flex-1 relative transition-all duration-300">
          <GraphArea isFullscreen={isFullscreen} toggleFullscreen={() => setIsFullscreen(!isFullscreen)} />

          <NodeDetail />
        </div>
        {!isFullscreen && <ChatPanel isOpen={isChatOpen} />}

      </div>
    </div>
  );
}
