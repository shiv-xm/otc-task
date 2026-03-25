import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import { GraphNodeData } from '@/types/graph'; // assuming this exists, or use any if it fails

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  highlightIds?: string[];
  entities?: any[];
}

interface GraphState {
  // Analysis Data
  nodeStyles: Record<string, any>;
  setNodeStyles: (styles: Record<string, any>) => void;
  metrics: any;
  setMetrics: (metrics: any) => void;
  clearAnalysis: () => void;
  // Graph Data
  nodes: Node[];
  edges: Edge[];
  setGraph: (nodes: Node[], edges: Edge[]) => void;
  isLoadingGraph: boolean;
  setIsLoadingGraph: (loading: boolean) => void;
  
  // Interaction Data
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: string[]) => void;
  clearHighlights: () => void;
  
  selectedNodeId: string | null;
  selectedNodeData: any | null;
  setSelectedNode: (id: string | null, data?: any) => void;

  // Search & Disambiguation UI state
  searchResults: any[];
  isSearchModalOpen: boolean;
  setSearchModalOpen: (isOpen: boolean) => void;
  setSearchResults: (results: any[]) => void;

  // Chat Data
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  isQuerying: boolean;
  setIsQuerying: (loading: boolean) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodeStyles: {},
  setNodeStyles: (styles) => set({ nodeStyles: styles }),
  metrics: {},
  setMetrics: (metrics) => set({ metrics }),
  clearAnalysis: () => set({ nodeStyles: {}, metrics: {}, highlightedNodeIds: new Set() }),
  nodes: [],
  edges: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),
  isLoadingGraph: false,
  setIsLoadingGraph: (loading) => set({ isLoadingGraph: loading }),

  highlightedNodeIds: new Set(),
  setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: new Set(ids) }),
  clearHighlights: () => set({ highlightedNodeIds: new Set() }),

  selectedNodeId: null,
  selectedNodeData: null,
  setSelectedNode: (id, data = null) => set({ selectedNodeId: id, selectedNodeData: data }),

  searchResults: [],
  isSearchModalOpen: false,
  setSearchModalOpen: (isOpen) => set({ isSearchModalOpen: isOpen }),
  setSearchResults: (results) => set({ searchResults: results }),

  messages: [
    {
      role: 'assistant',
      content: 'Welcome to the Order-to-Cash process explorer. I can help you trace flows, find broken processes, or summarize business activities. What would you like to know?',
    }
  ],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
  isQuerying: false,
  setIsQuerying: (loading) => set({ isQuerying: loading }),
}));
