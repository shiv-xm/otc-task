"use client";

import { Send, Sparkles, Loader2, Play, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';

interface ChatPanelProps {
  isOpen: boolean;
}

export function ChatPanel({ isOpen }: ChatPanelProps) {
  const [query, setQuery] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const { messages, addMessage, isQuerying, setIsQuerying, setHighlightedNodeIds, highlightedNodeIds, setNodeStyles, clearAnalysis, metrics, setMetrics, setSelectedNode } = useGraphStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isQuerying]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isQuerying) return;

    const userMessage = query.trim();
    addMessage({ role: 'user', content: userMessage });
    setQuery('');
    setIsQuerying(true);
    setHighlightedNodeIds([]);
    setNodeStyles({});
    setMetrics({});
    
    try {
      // Always route through the full query service
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage }),
      });

      const qData = await res.json();
      const msgText = qData.answerText || qData.error || "No response";
      const planKind: string = qData.planKind ?? "";
      const highlightNodes: string[] = qData.highlightNodeIds || [];

      // ── Apply node styles based on plan kind ─────────────
      const newStyles: Record<string, any> = {};

      const brokenKinds = ["FIND_BROKEN_SALES_FLOWS", "FIND_DELIVERED_NOT_BILLED", "FIND_BILLED_WITHOUT_DELIVERY"];
      const traceKinds = ["TRACE_DOCUMENT_FLOW", "FIND_JOURNAL_FOR_BILLING", "FIND_PAYMENT_FOR_BILLING"];
      const analyticsKinds = ["TOP_PRODUCTS_BY_BILLING_COUNT", "TOP_CUSTOMERS_BY_BILLED_VOLUME"];
      const cancelKinds = ["BILLING_CANCELLATION_LOOKUP"];

      if (brokenKinds.includes(planKind)) {
        highlightNodes.forEach((id: string) => {
          newStyles[id] = { border: "2px solid #ef4444", boxShadow: "0 0 12px #ef4444", backgroundColor: "#fee2e2" };
        });
      } else if (cancelKinds.includes(planKind)) {
        highlightNodes.forEach((id: string) => {
          newStyles[id] = { border: "2px solid #f59e0b", boxShadow: "0 0 12px #f59e0b", backgroundColor: "#fef3c7" };
        });
      } else if (analyticsKinds.includes(planKind)) {
        const colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];
        highlightNodes.forEach((id: string, i: number) => {
          const c = colors[i % colors.length];
          newStyles[id] = { border: `2px solid ${c}`, boxShadow: `0 0 10px ${c}` };
        });
      } else if (traceKinds.includes(planKind) || highlightNodes.length > 0) {
        highlightNodes.forEach((id: string) => {
          newStyles[id] = { border: "2px solid #3b82f6", boxShadow: "0 0 10px #3b82f6" };
        });
      }

      setNodeStyles(newStyles);
      setHighlightedNodeIds(highlightNodes);

      // ── Auto-open metadata panel for first highlighted node ─
      if (highlightNodes.length > 0 && traceKinds.includes(planKind)) {
        setTimeout(() => {
          const targetId = highlightNodes[highlightNodes.length - 1];
          const nData = useGraphStore.getState().nodes.find(n => n.id === targetId)?.data;
          if (nData) setSelectedNode(targetId, nData);
        }, 150);
      }

      // Typing effect
      setIsQuerying(false);
      setStreamingText('');

      for (let i = 0; i <= msgText.length; i += 3) {
        await new Promise(r => setTimeout(r, 8));
        setStreamingText(msgText.slice(0, i));
        scrollToBottom();
      }
      setStreamingText('');

      addMessage({
        role: 'assistant',
        content: msgText,
        highlightIds: highlightNodes,
        entities: qData.relatedEntities ?? [],
      });

    } catch (err: any) {
      addMessage({
        role: 'assistant',
        content: `Error: ${err.message}`,
        isError: true
      });
    } finally {
      setIsQuerying(false);
    }
  };


  const handleExamine = (ids: string[]) => {
    setHighlightedNodeIds(ids);
    if (ids.length > 0) {
      const targetId = ids[ids.length - 1]; // pick the last connected node
      const nData = useGraphStore.getState().nodes.find(n => n.id === targetId)?.data;
      if (nData) setSelectedNode(targetId, nData);
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full bg-[#FAFAFA] border-l border-zinc-200 transition-all duration-300 ease-in-out shrink-0 z-20",
      isOpen ? "w-[400px] shadow-[-10px_0_30px_rgba(0,0,0,0.02)]" : "w-0 overflow-hidden"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-6 h-14 border-b border-zinc-200 shrink-0 bg-white">
        <Sparkles className="w-4 h-4 text-purple-600" />
        <h2 className="text-sm font-semibold text-zinc-900">O2C AI Assistant</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-white">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div key={idx} className={cn("flex flex-col gap-3 group")}>
              {/* Message Header */}
              <div className={cn("flex items-center gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm",
                  isUser ? "bg-zinc-100 text-zinc-600 border border-zinc-200" : "bg-zinc-900 text-white"
                )}>
                  {isUser ? "Y" : "D"}
                </div>
                <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
                  <div className="text-[11px] font-bold text-zinc-900">
                    {isUser ? "You" : "Dodge AI"}
                  </div>
                  {!isUser && <div className="text-[9px] text-zinc-400 font-medium">Graph Agent</div>}
                </div>
              </div>

              {/* Message Bubble */}
              <div className={cn(
                "max-w-[85%] text-sm rounded-xl leading-relaxed",
                isUser 
                  ? "self-end px-4 py-3 bg-zinc-900 text-zinc-50 shadow-sm" 
                  : msg.isError 
                    ? "self-start px-4 py-3 bg-red-50 text-red-800 border border-red-100"
                    : "self-start px-5 py-4 bg-white border border-zinc-100 shadow-sm text-zinc-800"
              )}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
                
                {msg.highlightIds && msg.highlightIds.length > 0 && (
                  <button 
                    onClick={() => handleExamine(msg.highlightIds || [])}
                    className="flex items-center gap-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg mt-4 border border-blue-100 transition-all w-full justify-center group/btn"
                  >
                    <MousePointerClick className="w-3 h-3 transition-transform group-hover/btn:scale-110" />
                    Focus on Related Entities ({msg.highlightIds.length})
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {isQuerying && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            </div>
            <div className="flex flex-col gap-2">
               <div className="text-[11px] font-bold text-zinc-900 border-b border-zinc-50 w-fit pb-1">Dodge AI is thinking...</div>
               <div className="flex gap-1.5 pt-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 animate-bounce"></div>
                 <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 animate-bounce [animation-delay:0.2s]"></div>
                 <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 animate-bounce [animation-delay:0.4s]"></div>
               </div>
            </div>
          </div>
        )}
        
        {/* Streaming text bubble */}
        {streamingText && (
          <div className="flex flex-col gap-3 group">
            <div className="flex items-center gap-3 flex-row">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm bg-zinc-900 text-white">
                D
              </div>
              <div className="flex flex-col items-start">
                <div className="text-[11px] font-bold text-zinc-900">Dodge AI</div>
                <div className="text-[9px] text-zinc-400 font-medium">Graph Agent</div>
              </div>
            </div>
            <div className="max-w-[85%] text-sm rounded-xl leading-relaxed self-start px-5 py-4 bg-white border border-zinc-100 shadow-sm text-zinc-800">
              <div className="whitespace-pre-wrap">{streamingText}</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-zinc-200 shrink-0 relative z-10">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isQuerying}
            placeholder="Ask about orders, deliveries, or payments..."
            className="w-full resize-none rounded-xl border border-zinc-200 bg-white pt-3 pb-3 pl-4 pr-12 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 focus:outline-none transition-shadow shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button 
            type="submit"
            disabled={!query.trim() || isQuerying}
            className="absolute bottom-3 right-3 p-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <button 
            type="button" 
            onClick={() => { setQuery('Trace billing document 91150187'); setTimeout(() => handleSubmit(new Event('submit') as any), 10); }}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            Trace billing 91150187
          </button>
          <button 
            type="button" 
            onClick={() => { setQuery('Find journal entry for billing 91150187'); setTimeout(() => handleSubmit(new Event('submit') as any), 10); }}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            Find journal entry
          </button>
          <button 
            type="button" 
            onClick={() => { setQuery('Trace sales order 9000'); setTimeout(() => handleSubmit(new Event('submit') as any), 10); }}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            Trace order 9000
          </button>
          <button 
            type="button" 
            onClick={() => { setQuery('Delivered but not billed'); setTimeout(() => handleSubmit(new Event('submit') as any), 10); }}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            Delivered but not billed
          </button>
          <button 
            type="button" 
            onClick={() => { setQuery('Top products by billing count'); setTimeout(() => handleSubmit(new Event('submit') as any), 10); }}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            Top products
          </button>
          <button 
            type="button" 
            onClick={() => { setQuery('Find broken flows'); setTimeout(() => handleSubmit(new Event('submit') as any), 10); }}
            className="whitespace-nowrap rounded-full border border-red-100 bg-red-50/50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100 hover:text-red-900 transition-colors"
          >
            Broken flows
          </button>
        </div>

        {/* Metrics Panel */}
        {Object.keys(metrics || {}).length > 0 && (
           <div className="mt-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex gap-4 text-xs">
              {metrics.brokenCount !== undefined && (
                <div className="flex flex-col">
                   <span className="text-zinc-500 font-medium mb-0.5">Broken Flows</span>
                   <span className="text-red-600 font-bold text-sm">{metrics.brokenCount}</span>
                </div>
              )}
              {metrics.clusterCount !== undefined && (
                <div className="flex flex-col border-l border-zinc-200 pl-4">
                   <span className="text-zinc-500 font-medium mb-0.5">Clusters</span>
                   <span className="text-blue-600 font-bold text-sm">{metrics.clusterCount}</span>
                </div>
              )}
              {metrics.bottleneckCount !== undefined && (
                <div className="flex flex-col border-l border-zinc-200 pl-4">
                   <span className="text-zinc-500 font-medium mb-0.5">Bottlenecks</span>
                   <span className="text-yellow-600 font-bold text-sm">{metrics.bottleneckCount}</span>
                </div>
              )}
              {metrics.longestPathLength !== undefined && (
                <div className="flex flex-col border-l border-zinc-200 pl-4">
                   <span className="text-zinc-500 font-medium mb-0.5">Longest Path Length</span>
                   <span className="text-indigo-600 font-bold text-sm">{metrics.longestPathLength} Nodes</span>
                </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
}
