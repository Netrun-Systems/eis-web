import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { ragClient, EIS_COLLECTIONS } from '../../engine/rag/charlotte-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeNode {
  id: string;
  npcId: string;
  npcName: string;
  faction: string;
  knowledgeSnippet: string;
  score: number;
}

interface KnowledgeEdge {
  sourceId: string;
  targetId: string;
  fidelity: number;
  protocol: string;
  label: string;
}

interface KnowledgeGraphState {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedNodeId: string | null;
  factionFilter: string;
}

// ---------------------------------------------------------------------------
// Simple SVG force-like layout
// ---------------------------------------------------------------------------

interface LayoutNode extends KnowledgeNode {
  x: number;
  y: number;
}

function computeLayout(nodes: KnowledgeNode[], width: number, height: number): LayoutNode[] {
  if (nodes.length === 0) return [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) * 0.75;

  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return {
      ...n,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeGraph() {
  const { world } = useSimulationStore();
  const npcs = world?.npcs ?? [];
  const ragAvailable = ragClient.isAvailable();

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize] = useState({ w: 680, h: 420 });

  const factions = Array.from(
    new Set(npcs.flatMap(n => n.groupAffiliations))
  ).sort();

  const [state, setState] = useState<KnowledgeGraphState>({
    nodes: [],
    edges: [],
    isLoading: false,
    error: null,
    searchQuery: '',
    selectedNodeId: null,
    factionFilter: 'All',
  });

  const handleSearch = useCallback(async () => {
    if (!ragAvailable) return;
    setState(s => ({ ...s, isLoading: true, error: null, selectedNodeId: null }));
    try {
      const query = state.searchQuery.trim() || 'knowledge faction lore';
      const results = await ragClient.query(query, {
        collection: EIS_COLLECTIONS.NPC_KNOWLEDGE,
        top_k: 20,
        min_score: 0.25,
        filter_faction: state.factionFilter !== 'All' ? state.factionFilter : undefined,
      });

      // Build nodes from results
      const newNodes: KnowledgeNode[] = results.map((r, i) => {
        // Try to extract NPC info from metadata or source field
        const npcId = (r.metadata?.['npc_id'] as string) || r.source || 'world';
        const npc = world?.npcs.find(n => n.id === npcId);
        const faction = (r.metadata?.['faction'] as string) ||
          npc?.groupAffiliations[0] ||
          'Unknown';

        return {
          id: `node-${i}`,
          npcId,
          npcName: npc?.name ?? npcId,
          faction,
          knowledgeSnippet: r.content.slice(0, 120),
          score: r.similarity_score,
        };
      });

      // Build edges from KnowledgeTransfer patterns in content
      const newEdges: KnowledgeEdge[] = [];
      for (const r of results) {
        const transferMatch = r.content.match(
          /\[KnowledgeTransfer\|from:(\w+)\|protocol:(\w+)\|fidelity:(\d+)\]/
        );
        if (transferMatch) {
          const [, fromId, protocol, fidelityStr] = transferMatch;
          const toId = (r.metadata?.['npc_id'] as string) || r.source || 'world';
          const fromNode = newNodes.find(n => n.npcId === fromId);
          const toNode = newNodes.find(n => n.npcId === toId);
          if (fromNode && toNode && fromNode.id !== toNode.id) {
            newEdges.push({
              sourceId: fromNode.id,
              targetId: toNode.id,
              fidelity: parseInt(fidelityStr, 10),
              protocol,
              label: `${protocol} (${fidelityStr}%)`,
            });
          }
        }
      }

      setState(s => ({ ...s, nodes: newNodes, edges: newEdges, isLoading: false }));
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [ragAvailable, state.searchQuery, state.factionFilter, world]);

  const layoutNodes = computeLayout(state.nodes, svgSize.w, svgSize.h);

  const selectedNode = layoutNodes.find(n => n.id === state.selectedNodeId);

  const getNodeColor = (faction: string): string => {
    if (faction.toLowerCase().includes('raider')) return '#ef4444';
    if (faction.toLowerCase().includes('remnant')) return '#3b82f6';
    if (faction.toLowerCase().includes('machine') || faction.toLowerCase().includes('ai')) return '#a855f7';
    if (faction.toLowerCase().includes('nomad')) return '#f59e0b';
    return '#10b981';
  };

  const getFidelityColor = (fidelity: number): string => {
    if (fidelity >= 80) return '#10b981';
    if (fidelity >= 60) return '#f59e0b';
    return '#ef4444';
  };

  if (!world) {
    return <div className="eis-card text-center text-eis-text-muted py-12">Load simulation data first.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-eis-text">Knowledge Graph</h2>
        <p className="text-sm text-eis-text-muted">
          Visualize knowledge flow between NPCs via RAG query
          {!ragAvailable && <span className="ml-2 text-yellow-400">(RAG offline)</span>}
        </p>
      </div>

      {/* Controls */}
      <div className="eis-card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-eis-text-muted mb-1">Knowledge Query</label>
          <input
            type="text"
            value={state.searchQuery}
            onChange={e => setState(s => ({ ...s, searchQuery: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. combat tactics, trade routes..."
            className="eis-input w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-eis-text-muted mb-1">Faction Filter</label>
          <select
            value={state.factionFilter}
            onChange={e => setState(s => ({ ...s, factionFilter: e.target.value }))}
            className="eis-input"
          >
            <option value="All">All Factions</option>
            {factions.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSearch}
          disabled={state.isLoading || !ragAvailable}
          className="eis-btn-primary px-6"
        >
          {state.isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Loading
            </span>
          ) : (
            'Query Knowledge'
          )}
        </button>
      </div>

      {state.error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded p-3 text-eis-danger text-sm">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* SVG Graph */}
        <div className="col-span-2 eis-card p-0 overflow-hidden">
          {state.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-eis-text-muted text-sm">
              {ragAvailable
                ? 'Run a query to populate the graph.'
                : 'RAG service unavailable.'}
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={svgSize.w}
              height={svgSize.h}
              className="w-full"
              viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
            >
              {/* Edges */}
              {state.edges.map((edge, i) => {
                const src = layoutNodes.find(n => n.id === edge.sourceId);
                const tgt = layoutNodes.find(n => n.id === edge.targetId);
                if (!src || !tgt) return null;
                const color = getFidelityColor(edge.fidelity);
                const midX = (src.x + tgt.x) / 2;
                const midY = (src.y + tgt.y) / 2;
                return (
                  <g key={i}>
                    <line
                      x1={src.x} y1={src.y}
                      x2={tgt.x} y2={tgt.y}
                      stroke={color}
                      strokeWidth={2}
                      strokeOpacity={0.6}
                      strokeDasharray={edge.fidelity < 70 ? '4 3' : undefined}
                    />
                    <text x={midX} y={midY - 4} fill={color} fontSize={8} textAnchor="middle" opacity={0.8}>
                      {edge.fidelity}%
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {layoutNodes.map(node => {
                const color = getNodeColor(node.faction);
                const isSelected = state.selectedNodeId === node.id;
                return (
                  <g
                    key={node.id}
                    onClick={() =>
                      setState(s => ({
                        ...s,
                        selectedNodeId: s.selectedNodeId === node.id ? null : node.id,
                      }))
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={node.x} cy={node.y}
                      r={isSelected ? 22 : 16}
                      fill={color}
                      fillOpacity={isSelected ? 0.9 : 0.3}
                      stroke={color}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    <text
                      x={node.x} y={node.y + 1}
                      fill="white"
                      fontSize={9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontWeight="bold"
                    >
                      {node.npcName.split(' ')[0].slice(0, 6)}
                    </text>
                    <text
                      x={node.x} y={node.y + 28}
                      fill={color}
                      fontSize={8}
                      textAnchor="middle"
                      opacity={0.7}
                    >
                      {node.faction.split(' ')[0].slice(0, 8)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Detail panel */}
        <div className="space-y-3">
          {/* Legend */}
          <div className="eis-card p-3 text-xs space-y-2">
            <h4 className="font-semibold text-eis-text">Legend</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-eis-green" />
                <span className="text-eis-text-muted">High fidelity (&ge;80%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-yellow-400" />
                <span className="text-eis-text-muted">Medium fidelity (60-79%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-eis-danger border-dashed border-t" style={{ borderStyle: 'dashed' }} />
                <span className="text-eis-text-muted">Low fidelity (&lt;60%)</span>
              </div>
            </div>
          </div>

          {/* Selected node detail */}
          {selectedNode ? (
            <div className="eis-card p-3 space-y-2">
              <h4 className="font-semibold text-eis-text">{selectedNode.npcName}</h4>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-eis-text-muted">NPC ID:</span>
                  <span className="font-mono text-eis-text">{selectedNode.npcId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-eis-text-muted">Faction:</span>
                  <span className="text-eis-text">{selectedNode.faction}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-eis-text-muted">Relevance:</span>
                  <span className="font-mono text-eis-green">
                    {(selectedNode.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-eis-text-muted mb-1">Knowledge snippet:</p>
                <p className="text-xs text-eis-text bg-eis-bg rounded p-2 leading-snug">
                  {selectedNode.knowledgeSnippet}
                  {selectedNode.knowledgeSnippet.length === 120 && '...'}
                </p>
              </div>
              {/* Edges connected to this node */}
              {state.edges.filter(
                e => e.sourceId === selectedNode.id || e.targetId === selectedNode.id
              ).length > 0 && (
                <div>
                  <p className="text-xs text-eis-text-muted mb-1">Knowledge transfers:</p>
                  {state.edges
                    .filter(e => e.sourceId === selectedNode.id || e.targetId === selectedNode.id)
                    .map((e, i) => {
                      const other = layoutNodes.find(
                        n => n.id === (e.sourceId === selectedNode.id ? e.targetId : e.sourceId)
                      );
                      const dir = e.sourceId === selectedNode.id ? '→' : '←';
                      return (
                        <div key={i} className="text-xs text-eis-text-secondary flex items-center gap-1">
                          <span>{dir}</span>
                          <span>{other?.npcName ?? '?'}</span>
                          <span className="text-eis-text-muted">via {e.protocol}</span>
                          <span
                            className={`ml-auto font-mono ${
                              e.fidelity >= 80 ? 'text-eis-green' : e.fidelity >= 60 ? 'text-yellow-400' : 'text-eis-danger'
                            }`}
                          >
                            {e.fidelity}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <div className="eis-card p-3 text-xs text-eis-text-muted">
              Click a node to see knowledge details.
            </div>
          )}

          {/* Stats */}
          {state.nodes.length > 0 && (
            <div className="eis-card p-3 text-xs space-y-1">
              <h4 className="font-semibold text-eis-text">Graph Stats</h4>
              <div className="flex justify-between">
                <span className="text-eis-text-muted">Knowledge nodes:</span>
                <span className="font-mono text-eis-text">{state.nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-eis-text-muted">Transfer edges:</span>
                <span className="font-mono text-eis-text">{state.edges.length}</span>
              </div>
              {state.edges.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-eis-text-muted">Avg fidelity:</span>
                  <span className="font-mono text-eis-green">
                    {Math.round(
                      state.edges.reduce((s, e) => s + e.fidelity, 0) / state.edges.length
                    )}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
