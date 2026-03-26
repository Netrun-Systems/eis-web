import { useEffect, useCallback, useRef } from 'react';
import { create } from 'zustand';
import type { WorldState, SimulationEvent, NPC } from '../engine/types';
import { EISSimulation, type SimulationSpeed } from '../engine/simulation';
import { loadAllData } from '../engine/csv-loader';

interface SimulationStore {
  world: WorldState | null;
  simulation: EISSimulation;
  isPaused: boolean;
  speed: SimulationSpeed;
  isLoading: boolean;
  error: string | null;
  selectedNPCId: string | null;
  recentEvents: SimulationEvent[];
  tickCounter: number; // triggers re-renders

  // Actions
  loadWorld: () => Promise<void>;
  play: () => void;
  pause: () => void;
  step: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  selectNPC: (id: string | null) => void;
  reset: () => Promise<void>;
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  const sim = new EISSimulation();

  return {
    world: null,
    simulation: sim,
    isPaused: true,
    speed: 1,
    isLoading: false,
    error: null,
    selectedNPCId: null,
    recentEvents: [],
    tickCounter: 0,

    loadWorld: async () => {
      set({ isLoading: true, error: null });
      try {
        const world = await loadAllData('/data');
        sim.initialize(world);
        set({ world, isLoading: false });
      } catch (err) {
        set({ error: String(err), isLoading: false });
      }
    },

    play: () => {
      sim.play();
      set({ isPaused: false });
    },

    pause: () => {
      sim.pause();
      set({ isPaused: true });
    },

    step: () => {
      const events = sim.step();
      set(state => ({
        recentEvents: events,
        tickCounter: state.tickCounter + 1,
      }));
    },

    setSpeed: (speed: SimulationSpeed) => {
      sim.setSpeed(speed);
      set({ speed });
    },

    selectNPC: (id: string | null) => {
      set({ selectedNPCId: id });
    },

    reset: async () => {
      sim.pause();
      set({ isPaused: true, isLoading: true });
      try {
        const world = await loadAllData('/data');
        sim.initialize(world);
        set({ world, isLoading: false, recentEvents: [], tickCounter: 0 });
      } catch (err) {
        set({ error: String(err), isLoading: false });
      }
    },
  };
});

/**
 * Hook that subscribes to simulation tick events and triggers re-renders.
 */
export function useSimulationTick() {
  const { simulation, world } = useSimulationStore();

  useEffect(() => {
    const unsub = simulation.subscribe((events) => {
      useSimulationStore.setState(state => ({
        recentEvents: events,
        tickCounter: state.tickCounter + 1,
      }));
    });
    return unsub;
  }, [simulation]);

  return { world, stats: simulation.getStats() };
}

/**
 * Get the currently selected NPC.
 */
export function useSelectedNPC(): NPC | null {
  const { world, selectedNPCId } = useSimulationStore();
  if (!world || !selectedNPCId) return null;
  return world.npcs.find(n => n.id === selectedNPCId) ?? null;
}
