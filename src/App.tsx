import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TouchLayout } from './ui/touch/TouchLayout';
import { Dashboard } from './ui/dashboard/Dashboard';
import { NPCList } from './ui/npc/NPCList';
import { NPCDetail } from './ui/npc/NPCDetail';
import { WorldMap } from './ui/world/WorldMap';
import { WorldMapEditor } from './ui/world/WorldMapEditor';
import { FactionPanel } from './ui/world/FactionPanel';
import { RelationshipGraph } from './ui/relationships/RelationshipGraph';
import { TrustMatrix } from './ui/relationships/TrustMatrix';
import { TradeLog } from './ui/economy/TradeLog';
import { TradeView } from './ui/economy/TradeView';
import { CombatLog } from './ui/combat/CombatLog';
import { TensionOverlay } from './ui/world/TensionOverlay';
import { PlayerHUD } from './ui/player/PlayerHUD';
import { CharacterCreation } from './ui/player/CharacterCreation';
import { SimulationLog } from './ui/simulation/SimulationLog';
import { TimelineView } from './ui/simulation/TimelineView';
import { CSVEditor } from './ui/csv/CSVEditor';
import { ConversationSimulator } from './ui/dialogue/ConversationSimulator';
import { MemoryBrowser } from './ui/dialogue/MemoryBrowser';
import { KnowledgeGraph } from './ui/dialogue/KnowledgeGraph';
import { PixiGameView } from './ui/pixi/PixiGameView';
import { useSimulationStore, useSimulationTick } from './hooks/useSimulation';

export function App() {
  const { loadWorld, isLoading, error } = useSimulationStore();

  useEffect(() => {
    loadWorld();
  }, [loadWorld]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-eis-bg">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-eis-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-eis-text text-lg">Loading EIS Simulation Data...</p>
          <p className="text-eis-text-muted text-sm mt-2">Parsing 45 CSV files</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-eis-bg">
        <div className="eis-card max-w-md">
          <h2 className="text-eis-danger text-xl font-bold mb-2">Load Error</h2>
          <p className="text-eis-text-secondary">{error}</p>
          <button onClick={() => loadWorld()} className="eis-btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

function AppContent() {
  useSimulationTick();

  return (
    <TouchLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/npcs" element={<NPCList />} />
        <Route path="/npcs/:id" element={<NPCDetail />} />
        <Route path="/map" element={<WorldMap />} />
        {/* PixiJS-powered game views */}
        <Route path="/play" element={<PixiGameView mode="play" />} />
        <Route path="/editor" element={<PixiGameView mode="editor" />} />
        <Route path="/observe" element={<PixiGameView mode="observe" />} />
        {/* Legacy editor kept at old route */}
        <Route path="/world-editor" element={<WorldMapEditor />} />
        <Route path="/factions" element={<FactionPanel />} />
        <Route path="/relationships" element={<RelationshipGraph />} />
        <Route path="/trust" element={<TrustMatrix />} />
        <Route path="/economy" element={<TradeLog />} />
        <Route path="/trade" element={<TradeView />} />
        <Route path="/combat" element={<CombatLog />} />
        <Route path="/tensions" element={<TensionOverlay />} />
        <Route path="/create-character" element={<CharacterCreation />} />
        <Route path="/log" element={<SimulationLog />} />
        <Route path="/timeline" element={<TimelineView />} />
        <Route path="/csv" element={<CSVEditor />} />
        <Route path="/dialogue" element={<ConversationSimulator />} />
        <Route path="/memories" element={<MemoryBrowser />} />
        <Route path="/knowledge" element={<KnowledgeGraph />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </TouchLayout>
  );
}
