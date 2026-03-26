// ============================================================
// EIS Player Character System
// Allows a controllable player character that exists in the
// same simulation as AI NPCs. Supports direct and autonomous modes.
// ============================================================

import type {
  NPC,
  WorldState,
  SimulationEvent,
  System,
  PlayerAction,
  PlayerQuestEntry,
  NPCAttributes,
  PersonalityTraits,
  NPCNeeds,
  TalentProfile,
} from './types';
import { tickNeeds } from './systems/need-system';
import { selectBehavior, executeBehavior } from './systems/behavior-system';
import { findPath, moveToward } from './pathfinding';

// --- Player Character Factory ---

export interface PlayerCreationOptions {
  name: string;
  attributes: NPCAttributes;
  personality: PersonalityTraits;
  topTalents: string[];
  faction?: string;
  startPosition: { x: number; y: number };
  role?: string;
  icon?: string;
  color?: string;
}

export function createPlayerCharacter(opts: PlayerCreationOptions): NPC {
  const maxHealth = opts.attributes.health + opts.attributes.endurance * 3;

  const talentAll = new Map<string, number>();
  for (const t of opts.topTalents) {
    talentAll.set(t, 8);
  }

  const player: NPC = {
    id: 'player-character',
    name: opts.name,
    species: 'Human',
    age: '30',
    gender: 'Unknown',
    attributes: opts.attributes,
    personality: opts.personality,
    needs: {
      hunger: 30,
      thirst: 30,
      rest: 20,
      socialInteraction: 40,
      energy: 30,
      hygiene: 20,
      comfort: 30,
      safety: 20,
      selfActualization: 50,
      entertainment: 40,
    },
    memoryDecayRate: 0.005,
    knowledgeCapacity: 200,
    emotionalState: 'Calm',
    groupAffiliations: opts.faction ? [opts.faction] : [],
    assignedRoles: opts.role ? [opts.role] : [],
    homeLocation: 'Player Home',
    workLocation: 'N/A',
    knownRisks: [],
    needsHome: false,
    needsWork: false,
    needsRiskInfo: false,
    awarenessLevel: 'Active',
    dialogueOptions: [],
    relationships: new Map(),
    culturalTraits: new Map(),
    inventory: ['Bread', 'Bread', 'Bread', 'Short Sword', 'Healing Potion', 'Healing Potion'],
    skills: new Map([
      ['CombatSkill', 5],
      ['Diplomacy', 3],
      ['Bartering', 3],
      ['SurvivalSkill', 4],
    ]),
    knowledgeBase: [],
    currentBehavior: null,
    position: { ...opts.startPosition },
    talentProfile: {
      topFive: opts.topTalents.slice(0, 5),
      all: talentAll,
    },
    currentHealth: maxHealth,
    maxHealth,
    isInCombat: false,
    isDowned: false,
    gold: 50,
    isPlayer: true,
  };

  return player;
}

// --- Default player for quick start ---

export function createDefaultPlayer(): NPC {
  return createPlayerCharacter({
    name: 'Scout',
    attributes: {
      strength: 6,
      dexterity: 7,
      endurance: 6,
      health: 70,
      intelligence: 7,
      wisdom: 6,
      willpower: 6,
      charisma: 6,
    },
    personality: {
      aggression: 4,
      friendliness: 6,
      curiosity: 7,
      fearfulness: 3,
      loyalty: 5,
      independence: 6,
      confidence: 6,
      patience: 5,
      honesty: 6,
      empathy: 5,
      resourcefulness: 7,
      greed: 3,
      generosity: 5,
      survivalInstinct: 6,
    },
    topTalents: ['T001', 'T009', 'T023', 'T005', 'T017'],
    faction: '7', // Remnant Enclave
    startPosition: { x: 200, y: 250 },
    role: 'Scout',
  });
}

// --- Player System ---

export class PlayerSystem implements System {
  name = 'PlayerSystem';
  controlMode: 'direct' | 'autonomous' = 'direct';
  private playerPath: { x: number; y: number }[] = [];
  private playerPathIndex = 0;
  private moveSpeed = 0.8;

  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    if (!world.playerId) return events;
    const player = world.npcs.find(n => n.id === world.playerId);
    if (!player || player.isDowned) return events;

    if (!world.playerActionQueue) world.playerActionQueue = [];

    // In autonomous mode, player acts like a regular NPC
    if (this.controlMode === 'autonomous') {
      return this.tickAutonomous(player, world, deltaTime);
    }

    // Direct mode: process queued actions
    const action = world.playerActionQueue.shift();
    if (!action) return events;

    const actionEvents = this.processAction(action, player, world);
    events.push(...actionEvents);

    return events;
  }

  processAction(action: PlayerAction, player: NPC, world: WorldState): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    switch (action.type) {
      case 'move': {
        if (typeof action.target === 'object' && action.target && 'x' in action.target) {
          const target = action.target as { x: number; y: number };
          this.playerPath = [target]; // Direct movement
          this.playerPathIndex = 0;

          // Move toward target
          const newPos = moveToward(player.position, target, this.moveSpeed);
          player.position.x = newPos.x;
          player.position.y = newPos.y;

          events.push({
            id: `player-move-${world.tickCount}`,
            tick: world.tickCount,
            gameTime: world.time,
            type: 'player_move',
            actorId: player.id,
            description: `${player.name} moves toward (${Math.round(target.x)}, ${Math.round(target.y)})`,
            data: { target },
          });
        }
        break;
      }

      case 'attack': {
        const targetId = typeof action.target === 'string' ? action.target : undefined;
        if (!targetId) break;

        const target = world.npcs.find(n => n.id === targetId);
        if (!target || target.isDowned) break;

        // Force combat initiation — set conditions for combat system to pick up
        player.needs.safety = 100;
        player.personality.aggression = 10; // Temporary override for initiation
        // Move toward target if not adjacent
        const dx = target.position.x - player.position.x;
        const dy = target.position.y - player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 3) {
          const newPos = moveToward(player.position, target.position, this.moveSpeed);
          player.position.x = newPos.x;
          player.position.y = newPos.y;
        }

        events.push({
          id: `player-attack-${world.tickCount}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'player_interact',
          actorId: player.id,
          targetId,
          description: `${player.name} initiates combat with ${target.name}!`,
        });
        break;
      }

      case 'talk': {
        const targetId = typeof action.target === 'string' ? action.target : undefined;
        if (!targetId) break;

        const target = world.npcs.find(n => n.id === targetId);
        if (!target) break;

        events.push({
          id: `player-talk-${world.tickCount}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'player_dialogue',
          actorId: player.id,
          targetId,
          description: `${player.name} talks to ${target.name}.`,
          data: { interactionType: 'dialogue' },
        });
        break;
      }

      case 'trade': {
        const targetId = typeof action.target === 'string' ? action.target : undefined;
        if (!targetId) break;

        events.push({
          id: `player-trade-${world.tickCount}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'player_interact',
          actorId: player.id,
          targetId,
          description: `${player.name} opens trade with ${world.npcs.find(n => n.id === targetId)?.name ?? targetId}.`,
          data: { interactionType: 'trade' },
        });
        break;
      }

      case 'use_item': {
        const itemName = action.data?.item as string | undefined;
        if (!itemName) break;

        const itemIdx = player.inventory.findIndex(i => i === itemName);
        if (itemIdx === -1) break;

        // Apply item effects
        if (itemName.toLowerCase().includes('bread') || itemName.toLowerCase().includes('food')) {
          player.needs.hunger = Math.max(0, player.needs.hunger - 30);
          player.inventory.splice(itemIdx, 1);
        } else if (itemName.toLowerCase().includes('potion') || itemName.toLowerCase().includes('healing')) {
          player.currentHealth = Math.min(player.maxHealth, player.currentHealth + 25);
          player.inventory.splice(itemIdx, 1);
        }

        events.push({
          id: `player-use-${world.tickCount}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'player_interact',
          actorId: player.id,
          description: `${player.name} used ${itemName}.`,
          data: { item: itemName },
        });
        break;
      }

      case 'wait': {
        // Do nothing — let time pass
        events.push({
          id: `player-wait-${world.tickCount}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'player_interact',
          actorId: player.id,
          description: `${player.name} waits...`,
        });
        break;
      }
    }

    return events;
  }

  tickAutonomous(player: NPC, world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Determine top need
    const topNeed = tickNeeds(player, world.needs, 0);

    // Select and execute behavior
    const behavior = selectBehavior(player, topNeed, world.behaviors, world);
    if (behavior) {
      const event = executeBehavior(player, behavior, world);
      events.push(event);
    }

    return events;
  }

  setControlMode(mode: 'direct' | 'autonomous'): void {
    this.controlMode = mode;
  }
}

export const playerSystem = new PlayerSystem();

// --- Player visibility / fog of war ---

export function getVisibleTiles(
  playerPos: { x: number; y: number },
  sightRadius: number,
): Set<string> {
  const visible = new Set<string>();
  const px = Math.round(playerPos.x);
  const py = Math.round(playerPos.y);

  for (let dx = -sightRadius; dx <= sightRadius; dx++) {
    for (let dy = -sightRadius; dy <= sightRadius; dy++) {
      if (dx * dx + dy * dy <= sightRadius * sightRadius) {
        visible.add(`${px + dx},${py + dy}`);
      }
    }
  }

  return visible;
}
