"use client";

import dynamic from 'next/dynamic';
import { useGraphStore } from '@/lib/store/graph-store';
import { useEffect, useState, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { 
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#FAFAFA]">
      <div className="flex flex-col items-center gap-3 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <p className="text-sm font-medium">Loading Force Graph...</p>
      </div>
    </div>
  )
});

export function AnalysisGraphView() {
  const { 
    nodes: globalNodes, 
    edges: globalEdges, 
    highlightedNodeIds,
    nodeStyles,
    setSelectedNode,
    isLoadingGraph
  } = useGraphStore();

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Transform standard React Flow nodes/edges to ForceGraph format
  const graphData = useMemo(() => {
    const gNodes = globalNodes.map(n => ({
      id: n.id,
      label: n.data?.label || n.id,
      entityType: n.data?.type || 'Unknown',
      val: 1,
      style: nodeStyles[n.id] || null,
      isHighlighted: highlightedNodeIds.has(n.id),
      data: n.data
    }));

    const gEdges = globalEdges.map(e => ({
      source: e.source,
      target: e.target,
      id: e.id,
      isHighlighted: highlightedNodeIds.has(e.source) && highlightedNodeIds.has(e.target)
    }));

    return { nodes: gNodes, links: gEdges };
  }, [globalNodes, globalEdges, highlightedNodeIds, nodeStyles]);

  useEffect(() => {
    // Zoom to fit on load/data change
    if (graphRef.current && graphData.nodes.length > 0) {
      setTimeout(() => {
         graphRef.current?.zoomToFit(400, 50);
      }, 300);
    }
  }, [graphData.nodes.length]);

  const handleNodeClick = (node: any) => {
    setSelectedNode(node.id, node.data);
  };

  const handleBackgroundClick = () => {
    setSelectedNode(null);
  };

  const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label;
    const fontSize = 12 / globalScale;
    
    let color = '#94A3B8'; // default
    if (node.entityType === 'SalesOrder') color = '#3B82F6';
    else if (node.entityType === 'DeliveryHeader' || node.entityType === 'Delivery') color = '#F97316';
    else if (node.entityType === 'BillingDocument') color = '#A855F7';
    else if (node.entityType === 'Payment') color = '#14B8A6';

    const hasStyle = !!node.style;
    const isHighlighted = node.isHighlighted;
    const isDimmed = highlightedNodeIds.size > 0 && !hasStyle && !isHighlighted;

    let fillStyle = color;
    let borderColor = '#ffffff';
    let drawGlow = false;

    if (hasStyle) {
      if (node.style.backgroundColor) fillStyle = node.style.backgroundColor;
      if (node.style.border) {
        // e.g. "2px solid red" -> extract color
        const match = node.style.border.match(/solid\s+(.+)$/);
        if (match) borderColor = match[1];
      }
      if (node.style.boxShadow) drawGlow = true;
    } else if (isHighlighted) {
      borderColor = '#3B82F6';
      drawGlow = true;
    }

    if (isDimmed) {
      ctx.globalAlpha = 0.2;
    } else {
      ctx.globalAlpha = 1.0;
    }

    // Node body
    ctx.beginPath();
    ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    // Node border
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    if (drawGlow && !isDimmed) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    }

    ctx.globalAlpha = 1.0;
  };

  return (
    <div ref={containerRef} className="flex-1 h-full w-full relative bg-[#FAFAFA]">
       {isLoadingGraph && globalNodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-sm font-medium">Loading Graph Data...</p>
          </div>
        </div>
      ) : null}

      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={drawNode}
          linkColor={(link: any) => {
             if (highlightedNodeIds.size === 0) return 'rgba(148, 163, 184, 0.4)';
             return link.isHighlighted ? 'rgba(59, 130, 246, 0.8)' : 'rgba(148, 163, 184, 0.1)';
          }}
          linkWidth={(link: any) => link.isHighlighted ? 2 : 1}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          cooldownTicks={100}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          backgroundColor="#FAFAFA"
        />
      )}
    </div>
  );
}
