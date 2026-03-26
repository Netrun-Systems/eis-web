import type { WorldState, SimulationEvent, System } from './types';
import { needSystem } from './systems/need-system';
import { behaviorSystem } from './systems/behavior-system';
import { personalitySystem } from './systems/personality-system';
import { relationshipSystem } from './systems/relationship-system';
import { factionSystem } from './systems/faction-system';
import { economySystem } from './systems/economy-system';
import { knowledgeSystem } from './systems/knowledge-system';
import { questSystem } from './systems/quest-system';
import { locationSystem } from './systems/location-system';
import { scheduleSystem } from './systems/schedule-system';
import { tensionSystem } from './systems/tension-system';
import { combatSystem } from './systems/combat-system';
import { playerSystem } from './player';
import {
  onNPCInteraction,
  scheduleMemoryDecay,
  flushRAGQueue,
} from './rag/simulation-hooks';

export type SimulationSpeed = 0 | 1 | 2 | 5 | 10 | 100;

export interface SimulationConfig {
  tickRateMs: number; // Real milliseconds between ticks
  gameHoursPerTick: number; // Game time advance per tick
  maxEventLogSize: number;
  seed: number;
}

const DEFAULT_CONFIG: SimulationConfig = {
  tickRateMs: 100,
  gameHoursPerTick: 0.25, // 15 game-minutes per tick
  maxEventLogSize: 5000,
  seed: 42,
};

export type SimulationListener = (events: SimulationEvent[]) => void;

export class EISSimulation {
  world: WorldState | null = null;
  config: SimulationConfig;
  isPaused = true;
  speed: SimulationSpeed = 1;
  private systems: System[] = [];
  private intervalId: number | null = null;
  private listeners: Set<SimulationListener> = new Set();

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the simulation with loaded world data.
   */
  initialize(world: WorldState): void {
    this.world = world;
    // Initialize runtime arrays for new systems
    world.activeCombats = world.activeCombats ?? [];
    world.activeTensions = world.activeTensions ?? [];
    world.markets = world.markets ?? [];
    world.activeNegotiations = world.activeNegotiations ?? [];
    world.playerActionQueue = world.playerActionQueue ?? [];

    // Initialize NPC combat/health fields
    for (const npc of world.npcs) {
      if (npc.currentHealth === undefined) {
        npc.maxHealth = npc.attributes.health + npc.attributes.endurance * 3;
        npc.currentHealth = npc.maxHealth;
      }
      if (npc.isInCombat === undefined) npc.isInCombat = false;
      if (npc.isDowned === undefined) npc.isDowned = false;
      if (npc.gold === undefined) npc.gold = 10 + Math.floor(Math.random() * 40);
    }

    this.systems = [
      playerSystem,        // Player actions first
      scheduleSystem,
      needSystem,
      behaviorSystem,
      locationSystem,
      personalitySystem,
      relationshipSystem,
      tensionSystem,       // Tension after behavior, before combat
      combatSystem,        // Combat processes active fights
      factionSystem,
      economySystem,       // Advanced trade system
      knowledgeSystem,
      questSystem,
    ];
    this.isPaused = true;
    this.speed = 1;
  }

  /**
   * Subscribe to simulation events.
   */
  subscribe(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(events: SimulationEvent[]): void {
    for (const listener of this.listeners) {
      listener(events);
    }
  }

  /**
   * Execute a single simulation tick.
   */
  tick(): SimulationEvent[] {
    if (!this.world) return [];

    const deltaTime = this.config.gameHoursPerTick;
    const allEvents: SimulationEvent[] = [];

    for (const system of this.systems) {
      try {
        const events = system.tick(this.world, deltaTime);
        allEvents.push(...events);
      } catch (err) {
        console.error(`System ${system.name} error:`, err);
      }
    }

    // Update world state
    this.world.tickCount++;
    this.world.activeEvents = allEvents;

    // --- RAG integration hooks (fire-and-queue, non-blocking) ---
    // NPC interaction events: dialogue generation + knowledge propagation
    if (this.world.tickCount % 4 === 0) {
      const socialNPCs = this.world.npcs.filter(
        n => n.currentBehavior === 'Socialize' || n.currentBehavior === 'Trade'
      );
      for (const npc of socialNPCs) {
        const nearby = this.world.npcs.filter(other => {
          if (other.id === npc.id) return false;
          const dx = npc.position.x - other.position.x;
          const dy = npc.position.y - other.position.y;
          return Math.sqrt(dx * dx + dy * dy) < 150;
        });
        for (const target of nearby.slice(0, 1)) {
          const ragEvents = onNPCInteraction(npc, target, npc.currentBehavior ?? 'Socialize', this.world);
          allEvents.push(...ragEvents);
        }
      }
    }

    // Memory decay — once per game day
    if (this.world.tickCount % 96 === 0) {
      scheduleMemoryDecay(this.world.npcs, this.world.tickCount);
    }

    // Flush a batch of queued RAG operations each tick (non-blocking)
    flushRAGQueue(3).catch(() => { /* graceful degradation */ });

    // Append to event log (with size limit)
    this.world.eventLog.push(...allEvents);
    if (this.world.eventLog.length > this.config.maxEventLogSize) {
      this.world.eventLog = this.world.eventLog.slice(-this.config.maxEventLogSize);
    }

    this.notify(allEvents);
    return allEvents;
  }

  /**
   * Start the simulation loop.
   */
  play(): void {
    if (!this.world) return;
    this.isPaused = false;
    this.startLoop();
  }

  /**
   * Pause the simulation.
   */
  pause(): void {
    this.isPaused = true;
    this.stopLoop();
  }

  /**
   * Execute a single tick (step mode).
   */
  step(): SimulationEvent[] {
    return this.tick();
  }

  /**
   * Set simulation speed multiplier.
   */
  setSpeed(speed: SimulationSpeed): void {
    this.speed = speed;
    if (!this.isPaused) {
      this.stopLoop();
      this.startLoop();
    }
  }

  /**
   * Reset the simulation to initial state.
   */
  reset(world: WorldState): void {
    this.pause();
    this.initialize(world);
  }

  private startLoop(): void {
    this.stopLoop();
    if (this.speed === 0) return;

    const interval = Math.max(16, this.config.tickRateMs / this.speed);
    this.intervalId = window.setInterval(() => {
      if (!this.isPaused) {
        this.tick();
      }
    }, interval);
  }

  private stopLoop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get current simulation stats.
   */
  getStats() {
    if (!this.world) return null;
    return {
      tickCount: this.world.tickCount,
      day: this.world.day,
      hour: this.world.hour,
      npcCount: this.world.npcs.length,
      factionCount: this.world.factions.length,
      activeQuests: this.world.quests.filter(q => q.status === 'active').length,
      completedQuests: this.world.quests.filter(q => q.status === 'completed').length,
      totalEvents: this.world.eventLog.length,
    };
  }
}

// Singleton for use across the app
export const simulation = new EISSimulation();
