import React, { useState, useCallback } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { npcMemorySystem, type NPCMemory, type MemoryCategory } from '../../engine/rag/npc-memory';
import { ragClient } from '../../engine/rag/charlotte-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryBrowserState {
  selectedNPCId: string;
  searchQuery: string;
  memories: NPCMemory[];
  isLoading: boolean;
  error: string | null;
  addMemoryText: string;
  addMemoryWeight: number;
  addMemoryCategory: MemoryCategory;
  isAdding: boolean;
  sortBy: 'relevance' | 'weight' | 'tick';
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  event:       'bg-blue-900/40 text-blue-400',
  interaction: 'bg-eis-green/20 text-eis-green',
  observation: 'bg-purple-900/40 text-purple-400',
  knowledge:   'bg-yellow-900/40 text-yellow-400',
  trauma:      'bg-red-900/40 text-red-400',
};

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  event:       'Event',
  interaction: 'Interaction',
  observation: 'Observation',
  knowledge:   'Knowledge',
  trauma:      'Trauma',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemoryBrowser() {
  const { world } = useSimulationStore();
  const npcs = world?.npcs ?? [];
  const ragAvailable = ragClient.isAvailable();

  const [state, setState] = useState<MemoryBrowserState>({
    selectedNPCId: npcs[0]?.id ?? '',
    searchQuery: '',
    memories: [],
    isLoading: false,
    error: null,
    addMemoryText: '',
    addMemoryWeight: 5,
    addMemoryCategory: 'observation',
    isAdding: false,
    sortBy: 'relevance',
  });

  const selectedNPC = world?.npcs.find(n => n.id === state.selectedNPCId);

  const handleSearch = useCallback(async () => {
    if (!selectedNPC || !state.searchQuery.trim()) {
      // Load general memories for NPC
      setState(s => ({ ...s, isLoading: true, error: null }));
      try {
        const memories = await npcMemorySystem.recall(
          selectedNPC?.id ?? '',
          {
            currentSituation: 'general life experiences',
            currentEmotion: selectedNPC?.emotionalState ?? 'neutral',
            nearbyNpcs: [],
            location: selectedNPC?.homeLocation ?? 'world',
          },
          15,
          selectedNPC?.attributes.intelligence ?? 5
        );
        setState(s => ({ ...s, memories, isLoading: false }));
      } catch (err) {
        setState(s => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
      return;
    }

    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const memories = await npcMemorySystem.recall(
        state.selectedNPCId,
        {
          currentSituation: state.searchQuery,
          currentEmotion: selectedNPC.emotionalState,
          nearbyNpcs: [],
          location: selectedNPC.homeLocation,
        },
        15,
        selectedNPC.attributes.intelligence
      );
      setState(s => ({ ...s, memories, isLoading: false }));
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [state.selectedNPCId, state.searchQuery, selectedNPC]);

  const handleAddMemory = useCallback(async () => {
    if (!selectedNPC || !state.addMemoryText.trim() || !world) return;
    setState(s => ({ ...s, isAdding: true, error: null }));
    try {
      await npcMemorySystem.remember(
        selectedNPC.id,
        {
          content: state.addMemoryText,
          emotionalWeight: state.addMemoryWeight,
          category: state.addMemoryCategory,
          location: selectedNPC.homeLocation,
          tick: world.tickCount,
        },
        selectedNPC.attributes.intelligence,
        selectedNPC.memoryDecayRate
      );
      setState(s => ({
        ...s,
        isAdding: false,
        addMemoryText: '',
        // Refresh memories
        memories: [
          {
            content: `(Just added) ${s.addMemoryText}`,
            emotionalWeight: s.addMemoryWeight,
            category: s.addMemoryCategory,
            relatedNpcs: [],
            location: selectedNPC.homeLocation,
            tick: world.tickCount,
            relevanceScore: 1.0,
          },
          ...s.memories,
        ],
      }));
    } catch (err) {
      setState(s => ({
        ...s,
        isAdding: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [selectedNPC, state.addMemoryText, state.addMemoryWeight, state.addMemoryCategory, world]);

  const sortedMemories = [...state.memories].sort((a, b) => {
    if (state.sortBy === 'relevance') return b.relevanceScore - a.relevanceScore;
    if (state.sortBy === 'weight') return b.emotionalWeight - a.emotionalWeight;
    return b.tick - a.tick;
  });

  if (!world) {
    return <div className="eis-card text-center text-eis-text-muted py-12">Load simulation data first.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-eis-text">Memory Browser</h2>
        <p className="text-sm text-eis-text-muted">
          Browse and search NPC memories stored in RAG
          {!ragAvailable && <span className="ml-2 text-yellow-400">(RAG offline)</span>}
        </p>
      </div>

      {/* NPC selector + search */}
      <div className="eis-card space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-eis-text-muted mb-1">NPC</label>
            <select
              value={state.selectedNPCId}
              onChange={e => setState(s => ({ ...s, selectedNPCId: e.target.value, memories: [] }))}
              className="eis-input w-full"
            >
              {npcs.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-eis-text-muted mb-1">Semantic Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={state.searchQuery}
                onChange={e => setState(s => ({ ...s, searchQuery: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. trade, market, Raven..."
                className="eis-input flex-1"
              />
              <button
                onClick={handleSearch}
                disabled={state.isLoading || !selectedNPC || !ragAvailable}
                className="eis-btn-primary px-4"
              >
                {state.isLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* NPC summary */}
        {selectedNPC && (
          <div className="flex items-center gap-4 text-xs text-eis-text-secondary bg-eis-bg rounded p-2">
            <span className="font-medium text-eis-text">{selectedNPC.name}</span>
            <span>{selectedNPC.species}</span>
            <span>INT: {selectedNPC.attributes.intelligence}</span>
            <span>Decay rate: {selectedNPC.memoryDecayRate}</span>
            <span>Emotion: {selectedNPC.emotionalState}</span>
            <span>Home: {selectedNPC.homeLocation}</span>
          </div>
        )}
      </div>

      {state.error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded p-3 text-eis-danger text-sm">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Memory list */}
        <div className="col-span-2 space-y-3">
          {/* Sort controls */}
          {state.memories.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-eis-text-muted">Sort by:</span>
              {(['relevance', 'weight', 'tick'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setState(prev => ({ ...prev, sortBy: s }))}
                  className={`px-2 py-1 rounded ${state.sortBy === s ? 'bg-eis-green/20 text-eis-green' : 'text-eis-text-muted hover:text-eis-text'}`}
                >
                  {s === 'tick' ? 'Recency' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <span className="ml-auto text-eis-text-muted">{state.memories.length} memories</span>
            </div>
          )}

          {sortedMemories.length === 0 && !state.isLoading && (
            <div className="eis-card text-center py-12 text-eis-text-muted text-sm">
              {ragAvailable
                ? 'No memories loaded. Select an NPC and click Search.'
                : 'RAG service unavailable.'}
            </div>
          )}

          {sortedMemories.map((mem, idx) => (
            <MemoryRow key={idx} memory={mem} />
          ))}
        </div>

        {/* Add memory panel */}
        <div className="eis-card space-y-3 h-fit">
          <h3 className="text-sm font-semibold text-eis-text">Add Memory</h3>
          <p className="text-xs text-eis-text-muted">Manually inject a memory for testing.</p>

          <div>
            <label className="block text-xs text-eis-text-muted mb-1">Memory Content</label>
            <textarea
              value={state.addMemoryText}
              onChange={e => setState(s => ({ ...s, addMemoryText: e.target.value }))}
              rows={3}
              placeholder="Describe the memory..."
              className="eis-input w-full resize-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-eis-text-muted mb-1">
              Emotional Weight: {state.addMemoryWeight}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={state.addMemoryWeight}
              onChange={e => setState(s => ({ ...s, addMemoryWeight: Number(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-eis-text-muted mt-0.5">
              <span>Insignificant</span>
              <span>Traumatic</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-eis-text-muted mb-1">Category</label>
            <select
              value={state.addMemoryCategory}
              onChange={e => setState(s => ({ ...s, addMemoryCategory: e.target.value as MemoryCategory }))}
              className="eis-input w-full"
            >
              {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(cat => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleAddMemory}
            disabled={!state.addMemoryText.trim() || state.isAdding || !selectedNPC || !ragAvailable}
            className="eis-btn-primary w-full"
          >
            {state.isAdding ? 'Storing...' : 'Add Memory'}
          </button>
          {!ragAvailable && (
            <p className="text-xs text-yellow-400 text-center">RAG offline — memory will not persist</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryRow
// ---------------------------------------------------------------------------

function MemoryRow({ memory }: { memory: NPCMemory }) {
  const catColor = CATEGORY_COLORS[memory.category] ?? 'bg-eis-bg-hover text-eis-text-secondary';
  const weightBar = (memory.emotionalWeight / 10) * 100;
  const weightColor =
    memory.emotionalWeight >= 8 ? 'bg-red-500' :
    memory.emotionalWeight >= 5 ? 'bg-yellow-400' : 'bg-eis-green';

  return (
    <div className="eis-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-eis-text leading-snug flex-1">{memory.content}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${catColor}`}>
          {CATEGORY_LABELS[memory.category]}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-eis-text-muted">
        {memory.location && <span>📍 {memory.location}</span>}
        {memory.tick > 0 && <span>Tick {memory.tick}</span>}
        <span className="font-mono ml-auto">
          Relevance: {(memory.relevanceScore * 100).toFixed(0)}%
        </span>
      </div>

      {/* Emotional weight bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-eis-text-muted w-16 shrink-0">Emotion W:</span>
        <div className="flex-1 h-1.5 bg-eis-bg rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${weightColor}`} style={{ width: `${weightBar}%` }} />
        </div>
        <span className="text-xs font-mono text-eis-text-muted w-6 text-right">
          {memory.emotionalWeight}
        </span>
      </div>
    </div>
  );
}
