import React, { useState, useRef, useCallback } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { dialogueGenerator, type DialogueLine } from '../../engine/rag/dialogue-generator';
import { npcMemorySystem, type NPCMemory } from '../../engine/rag/npc-memory';
import { ragClient } from '../../engine/rag/charlotte-client';
import type { NPC } from '../../engine/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationMessage {
  id: string;
  line: DialogueLine;
  speaker: NPC;
  listener: NPC;
  timestamp: number;
}

interface SimulatorState {
  messages: ConversationMessage[];
  isGenerating: boolean;
  error: string | null;
  selectedSpeakerId: string;
  selectedListenerId: string;
  location: string;
  situation: string;
  showMemorySidebar: boolean;
  sidebarMemories: { msgId: string; memories: NPCMemory[] } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTrustLabel(trust: number): string {
  if (trust >= 80) return 'Deeply trusts';
  if (trust >= 60) return 'Trusts';
  if (trust >= 40) return 'Neutral';
  if (trust >= 20) return 'Wary';
  return 'Distrusts';
}

function getTrustColor(trust: number): string {
  if (trust >= 70) return 'text-eis-green';
  if (trust >= 40) return 'text-yellow-400';
  return 'text-eis-danger';
}

function getEmotionBadgeColor(emotion: string): string {
  const e = emotion.toLowerCase();
  if (e.includes('happy') || e.includes('confident') || e.includes('relaxed')) return 'bg-eis-green/20 text-eis-green';
  if (e.includes('angry') || e.includes('hostile') || e.includes('aggress')) return 'bg-red-900/40 text-red-400';
  if (e.includes('fear') || e.includes('anxious') || e.includes('stressed')) return 'bg-yellow-900/40 text-yellow-400';
  if (e.includes('sad') || e.includes('depress')) return 'bg-blue-900/40 text-blue-400';
  return 'bg-eis-bg-hover text-eis-text-secondary';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversationSimulator() {
  const { world } = useSimulationStore();

  const npcs = world?.npcs ?? [];
  const firstId = npcs[0]?.id ?? '';
  const secondId = npcs[1]?.id ?? npcs[0]?.id ?? '';

  const [state, setState] = useState<SimulatorState>({
    messages: [],
    isGenerating: false,
    error: null,
    selectedSpeakerId: firstId,
    selectedListenerId: secondId,
    location: 'Market Square',
    situation: 'A chance encounter',
    showMemorySidebar: false,
    sidebarMemories: null,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ragAvailable = ragClient.isAvailable();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const generateLine = useCallback(
    async (speakerId: string, listenerId: string) => {
      if (!world) return;
      const speaker = world.npcs.find(n => n.id === speakerId);
      const listener = world.npcs.find(n => n.id === listenerId);
      if (!speaker || !listener) return;

      setState(s => ({ ...s, isGenerating: true, error: null }));

      try {
        const line = await dialogueGenerator.generateDialogue(
          speaker,
          listener,
          { situation: state.situation, location: state.location },
          world.emotionalContagionRules
        );

        const msg: ConversationMessage = {
          id: `msg-${Date.now()}`,
          line,
          speaker,
          listener,
          timestamp: world.tickCount,
        };

        setState(s => ({
          ...s,
          messages: [...s.messages, msg],
          isGenerating: false,
        }));
        setTimeout(scrollToBottom, 50);
      } catch (err) {
        setState(s => ({
          ...s,
          isGenerating: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [world, state.situation, state.location, scrollToBottom]
  );

  const handleGenerate = useCallback(() => {
    generateLine(state.selectedSpeakerId, state.selectedListenerId);
  }, [generateLine, state.selectedSpeakerId, state.selectedListenerId]);

  const handleContinue = useCallback(() => {
    // Alternate speakers for back-and-forth conversation
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg) {
      generateLine(lastMsg.listener.id, lastMsg.speaker.id);
    } else {
      handleGenerate();
    }
  }, [state.messages, generateLine, handleGenerate]);

  const handleShowMemories = useCallback(
    async (msg: ConversationMessage) => {
      if (!ragAvailable) return;
      const memories = await npcMemorySystem.recall(
        msg.speaker.id,
        {
          currentSituation: state.situation,
          currentEmotion: msg.speaker.emotionalState,
          nearbyNpcs: [msg.listener.id],
          location: state.location,
        },
        8,
        msg.speaker.attributes.intelligence
      );
      setState(s => ({
        ...s,
        showMemorySidebar: true,
        sidebarMemories: { msgId: msg.id, memories },
      }));
    },
    [ragAvailable, state.situation, state.location]
  );

  const handleClearConversation = useCallback(() => {
    setState(s => ({ ...s, messages: [], sidebarMemories: null, showMemorySidebar: false }));
  }, []);

  if (!world) {
    return (
      <div className="eis-card text-center text-eis-text-muted py-12">
        Load simulation data first.
      </div>
    );
  }

  const speaker = world.npcs.find(n => n.id === state.selectedSpeakerId);
  const listener = world.npcs.find(n => n.id === state.selectedListenerId);
  const trustLevel = speaker?.relationships.get(state.selectedListenerId) ?? 50;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-eis-text">Conversation Simulator</h2>
          <p className="text-sm text-eis-text-muted">
            RAG-powered NPC dialogue with memory recall
            {!ragAvailable && (
              <span className="ml-2 text-yellow-400">(RAG offline — template mode)</span>
            )}
          </p>
        </div>
        <button onClick={handleClearConversation} className="eis-btn text-xs px-3 py-1">
          Clear
        </button>
      </div>

      {/* Configuration panel */}
      <div className="eis-card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Speaker */}
          <div>
            <label className="block text-xs text-eis-text-muted mb-1">Speaker</label>
            <select
              value={state.selectedSpeakerId}
              onChange={e => setState(s => ({ ...s, selectedSpeakerId: e.target.value }))}
              className="eis-input w-full"
            >
              {npcs.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.species})
                </option>
              ))}
            </select>
            {speaker && (
              <div className="mt-1 flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${getEmotionBadgeColor(speaker.emotionalState)}`}>
                  {speaker.emotionalState}
                </span>
                <span className="text-xs text-eis-text-muted">{speaker.groupAffiliations.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Listener */}
          <div>
            <label className="block text-xs text-eis-text-muted mb-1">Listener</label>
            <select
              value={state.selectedListenerId}
              onChange={e => setState(s => ({ ...s, selectedListenerId: e.target.value }))}
              className="eis-input w-full"
            >
              {npcs
                .filter(n => n.id !== state.selectedSpeakerId)
                .map(n => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.species})
                  </option>
                ))}
            </select>
            {listener && (
              <div className="mt-1 flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${getEmotionBadgeColor(listener.emotionalState)}`}>
                  {listener.emotionalState}
                </span>
                <span className="text-xs text-eis-text-muted">{listener.groupAffiliations.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Trust indicator */}
        {speaker && listener && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-eis-text-muted">Trust:</span>
            <div className="flex-1 h-2 bg-eis-bg rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${trustLevel >= 60 ? 'bg-eis-green' : trustLevel >= 40 ? 'bg-yellow-400' : 'bg-eis-danger'}`}
                style={{ width: `${trustLevel}%` }}
              />
            </div>
            <span className={`font-mono text-xs ${getTrustColor(trustLevel)}`}>
              {trustLevel}/100 ({getTrustLabel(trustLevel)})
            </span>
          </div>
        )}

        {/* Context */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-eis-text-muted mb-1">Location</label>
            <input
              type="text"
              value={state.location}
              onChange={e => setState(s => ({ ...s, location: e.target.value }))}
              className="eis-input w-full"
              placeholder="e.g. Market Square"
            />
          </div>
          <div>
            <label className="block text-xs text-eis-text-muted mb-1">Situation</label>
            <input
              type="text"
              value={state.situation}
              onChange={e => setState(s => ({ ...s, situation: e.target.value }))}
              className="eis-input w-full"
              placeholder="e.g. A chance encounter"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={state.isGenerating || state.selectedSpeakerId === state.selectedListenerId}
            className="eis-btn-primary flex-1"
          >
            {state.isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </span>
            ) : (
              'Generate Dialogue'
            )}
          </button>
          <button
            onClick={handleContinue}
            disabled={state.isGenerating || state.messages.length === 0}
            className="eis-btn px-4"
          >
            Continue
          </button>
        </div>

        {state.error && (
          <p className="text-eis-danger text-sm bg-red-950/30 rounded p-2">{state.error}</p>
        )}
      </div>

      {/* Conversation view + memory sidebar */}
      <div className={`flex gap-4 ${state.showMemorySidebar ? '' : ''}`}>
        {/* Chat window */}
        <div className="flex-1 eis-card">
          <div className="min-h-64 max-h-[28rem] overflow-y-auto space-y-4 pr-1">
            {state.messages.length === 0 ? (
              <p className="text-center text-eis-text-muted py-12 text-sm">
                Select two NPCs and click Generate Dialogue to begin.
              </p>
            ) : (
              state.messages.map(msg => (
                <ConversationBubble
                  key={msg.id}
                  msg={msg}
                  isActive={state.sidebarMemories?.msgId === msg.id}
                  onShowMemories={ragAvailable ? handleShowMemories : undefined}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Memory sidebar */}
        {state.showMemorySidebar && state.sidebarMemories && (
          <div className="w-72 eis-card shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-eis-text">Recalled Memories</h3>
              <button
                onClick={() => setState(s => ({ ...s, showMemorySidebar: false, sidebarMemories: null }))}
                className="text-eis-text-muted hover:text-eis-text text-xs"
              >
                ✕
              </button>
            </div>
            {state.sidebarMemories.memories.length === 0 ? (
              <p className="text-eis-text-muted text-xs">No relevant memories found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {state.sidebarMemories.memories.map((mem, i) => (
                  <MemoryCard key={i} memory={mem} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversationBubble
// ---------------------------------------------------------------------------

function ConversationBubble({
  msg,
  isActive,
  onShowMemories,
}: {
  msg: ConversationMessage;
  isActive: boolean;
  onShowMemories?: (msg: ConversationMessage) => void;
}) {
  const { speaker, listener, line } = msg;
  const trust = speaker.relationships.get(listener.id) ?? 50;

  return (
    <div className={`rounded-lg p-3 border transition-colors ${isActive ? 'border-eis-green/50 bg-eis-green/5' : 'border-eis-border bg-eis-bg-hover'}`}>
      {/* Speaker info row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-eis-green/20 flex items-center justify-center text-eis-green text-xs font-bold">
            {speaker.name.charAt(0)}
          </div>
          <div>
            <span className="text-sm font-semibold text-eis-text">{speaker.name}</span>
            <span className="text-xs text-eis-text-muted ml-2">→ {listener.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded ${getEmotionBadgeColor(speaker.emotionalState)}`}>
            {speaker.emotionalState}
          </span>
          <span className="text-xs font-mono text-eis-text-muted">
            T:{trust}
          </span>
        </div>
      </div>

      {/* Dialogue text */}
      <p className="text-eis-text text-sm leading-relaxed pl-9">
        &ldquo;{line.text}&rdquo;
      </p>

      {/* Meta row */}
      <div className="flex items-center justify-between mt-2 pl-9">
        <div className="flex items-center gap-3 text-xs text-eis-text-muted">
          <span>Pattern: <span className="text-eis-text">{line.patternUsed}</span></span>
          <span>Mode: <span className={line.generationMode === 'llm' ? 'text-eis-green' : 'text-yellow-400'}>{line.generationMode}</span></span>
          {line.recalledMemories.length > 0 && (
            <span className="text-blue-400">{line.recalledMemories.length} memories</span>
          )}
        </div>
        {onShowMemories && (
          <button
            onClick={() => onShowMemories(msg)}
            className="text-xs text-eis-text-muted hover:text-eis-green transition-colors"
          >
            View memories
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryCard
// ---------------------------------------------------------------------------

function MemoryCard({ memory }: { memory: NPCMemory }) {
  const weightColor =
    memory.emotionalWeight >= 8
      ? 'text-red-400'
      : memory.emotionalWeight >= 5
        ? 'text-yellow-400'
        : 'text-eis-text-muted';

  return (
    <div className="bg-eis-bg rounded p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="capitalize font-medium text-eis-text-secondary">{memory.category}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono ${weightColor}`}>W:{memory.emotionalWeight}</span>
          <span className="font-mono text-eis-text-muted">
            {(memory.relevanceScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <p className="text-eis-text leading-snug">{memory.content}</p>
      {memory.location && (
        <p className="text-eis-text-muted mt-1">at {memory.location}</p>
      )}
    </div>
  );
}
