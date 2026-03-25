"use client";

import { useEffect, useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGraphStore } from '@/lib/store/graph-store';
import { getLayoutedElements } from '@/lib/graph/layout';
import { CustomNode } from '@/components/graph/custom-node';
import { Loader2, Layers } from 'lucide-react';

const nodeTypes = {
  custom: CustomNode,
};

export function ProcessGraphView() {
  const {
    nodes: globalNodes,
    edges: globalEdges,
    setGraph,
    isLoadingGraph,
    setIsLoadingGraph,
    highlightedNodeIds,
    nodeStyles,
    setSelectedNode
  } = useGraphStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isOverlayHidden, setIsOverlayHidden] = useState(false);

  const fetchGraph = useCallback(async () => {
    setIsLoadingGraph(true);
    try {
      const res = await fetch('/api/graph/overview?limit=150');
      const data = await res.json();

      const mappedNodes: Node[] = (data.nodes || []).map((n: any) => ({
        id: n.id,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: n.id,
          type: n.entityType,
          subtitle: n.subtitle,
          properties: n.metadata,
        }
      }));

      const mappedEdges: Edge[] = (data.edges || []).map((e: any) => ({
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94A3B8', strokeWidth: 1.2, opacity: 0.4 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8', width: 10, height: 10 },
      }));

      const layouted = await getLayoutedElements(mappedNodes, mappedEdges, 'LR');
      setGraph(layouted.nodes, layouted.edges);
    } catch (err) {
      console.error('Failed to fetch initial graph', err);
    } finally {
      setIsLoadingGraph(false);
    }
  }, [setGraph, setIsLoadingGraph]);

  useEffect(() => {
    if (globalNodes.length === 0) {
      fetchGraph();
    }
  }, [fetchGraph, globalNodes.length]);

  // Sync global state to visual state
  useEffect(() => {
    const updatedNodes = globalNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        isHighlighted: highlightedNodeIds.has(n.id),
        analysisStyle: nodeStyles[n.id]
      }
    }));
    setNodes(updatedNodes);

    // Highlight edges that connect two highlighted nodes
    const updatedEdges = globalEdges.map(e => {
      const isSrc = highlightedNodeIds.has(e.source);
      const isTgt = highlightedNodeIds.has(e.target);
      const isHighlightedData = isSrc && isTgt;
      return {
        ...e,
        style: isHighlightedData
          ? { stroke: '#3B82F6', strokeWidth: 2, opacity: 1 }
          : {
            stroke: highlightedNodeIds.size > 0 ? '#E2E8F0' : '#94A3B8',
            strokeWidth: 1.2,
            opacity: highlightedNodeIds.size > 0 ? 0.2 : 0.4
          },
        animated: isHighlightedData,
      };
    });
    setEdges(updatedEdges);
  }, [globalNodes, globalEdges, highlightedNodeIds, nodeStyles, setNodes, setEdges]);

  const [rfInstance, setRfInstance] = useState<any>(null);

  useEffect(() => {
    if (highlightedNodeIds.size > 0 && rfInstance) {
      setTimeout(() => {
        const nodesToFit = Array.from(highlightedNodeIds).map(id => ({ id }));
        rfInstance.fitView({ nodes: nodesToFit, duration: 800, padding: 0.5, maxZoom: 1.2 });
      }, 100);
    }
  }, [highlightedNodeIds, rfInstance]);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNode(node.id, node.data);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
  };

  return (
    <div className="flex-1 h-full relative bg-[#FAFAFA]" style={{ width: '100%', height: '100%' }}>
      {isLoadingGraph && globalNodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-sm font-medium">Loading Graph Data...</p>
          </div>
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={setRfInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05}
        maxZoom={2}
        className="bg-zinc-50/10"
      >
        <Background gap={32} size={1} color="rgba(203, 213, 225, 0.4)" />
        <Controls showInteractive={false} className="bg-white border-zinc-200 shadow-sm !left-auto !right-4 !bottom-4 !flex-row" />
      </ReactFlow>

      <div className="absolute top-4 left-32 z-10 flex gap-2">
        <button
          onClick={() => setIsOverlayHidden(!isOverlayHidden)}
          className={`flex items-center gap-2 px-3 py-1.5 border shadow-sm rounded-md text-xs font-medium transition-colors ${isOverlayHidden
              ? "bg-zinc-100 text-zinc-600 border-zinc-200"
              : "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
            }`}
        >
          <Layers className="w-3.5 h-3.5" />
          {isOverlayHidden ? "Show Granular Overlay" : "Hide Granular Overlay"}
        </button>
      </div>

      {/* Legend */}
      {!isOverlayHidden && (
        <div className="absolute bottom-4 left-4 z-10 hidden sm:block pointer-events-none">
          <div className="bg-white/80 backdrop-blur-md border border-zinc-200/50 shadow-sm rounded-xl p-3 w-56 text-[10px] pointer-events-auto">
            <div className="font-bold text-zinc-400 uppercase tracking-widest mb-3 flex justify-between items-center">
              <span>Relationship Legend</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm bg-blue-500 shadow-sm"></div>
                <span className="text-zinc-600 font-medium">Sales Orders</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm bg-orange-500 shadow-sm"></div>
                <span className="text-zinc-600 font-medium">Outbound Deliveries</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm bg-purple-500 shadow-sm"></div>
                <span className="text-zinc-600 font-medium">Billing Documents</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm bg-teal-500 shadow-sm"></div>
                <span className="text-zinc-600 font-medium">Financial Payments</span>
              </div>
              <div className="pt-2 mt-2 border-t border-zinc-100 flex items-center gap-3 text-zinc-400">
                <div className="w-8 h-px bg-zinc-300"></div>
                <span>{nodes.length} Nodes Loaded</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
