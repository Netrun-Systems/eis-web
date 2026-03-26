// ============================================================
// EIS Location System — NPC movement and object interaction
// ============================================================

import type { WorldState, SimulationEvent, System, NPC } from '../types';
import type {
  WorldMapState,
  WorldObject,
  WorldLocation,
  NPCLocationState,
  ObjectInteraction,
} from '../world-map-types';
import { findPath, moveToward } from '../pathfinding';

/** Behavior → need → object category mapping */
const BEHAVIOR_OBJECT_MAP: Record<string, { need: string; categories: string[] }> = {
  FindFood: { need: 'hunger', categories: ['food', 'resource'] },
  Eat: { need: 'hunger', categories: ['food'] },
  Cook: { need: 'hunger', categories: ['food', 'crafting'] },
  Drink: { need: 'thirst', categories: ['water'] },
  Rest: { need: 'rest', categories: ['rest'] },
  Sleep: { need: 'rest', categories: ['rest'] },
  Trade: { need: 'socialInteraction', categories: ['trade'] },
  Socialize: { need: 'socialInteraction', categories: ['social'] },
  Train: { need: 'selfActualization', categories: ['training'] },
  Study: { need: 'selfActualization', categories: ['training'] },
  Craft: { need: 'selfActualization', categories: ['crafting'] },
  Guard: { need: 'safety', categories: ['defense'] },
  Patrol: { need: 'safety', categories: ['defense'] },
  Entertain: { need: 'entertainment', categories: ['social'] },
  Pray: { need: 'selfActualization', categories: ['social'] },
};

/** Find the nearest object matching needed categories */
function findNearestObject(
  npc: NPC,
  categories: string[],
  objects: WorldObject[],
  worldMap: WorldMapState,
): WorldObject | null {
  let best: WorldObject | null = null;
  let bestDist = Infinity;

  for (const obj of objects) {
    if (!categories.includes(obj.category)) continue;
    // Capacity check
    if (obj.currentUsers.length >= obj.capacity) continue;
    // Cooldown check
    if (obj.cooldownTicks > 0 && worldMap.config.seed > 0) {
      // simplified cooldown — skip recently used
    }
    // Role check
    if (obj.requiredRole && !npc.assignedRoles.includes(obj.requiredRole)) continue;

    const dx = obj.x - npc.position.x;
    const dy = obj.y - npc.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = obj;
    }
  }

  return best;
}

/** Find the nearest location of given types */
function findNearestLocation(
  npc: NPC,
  types: string[],
  locations: WorldLocation[],
): WorldLocation | null {
  let best: WorldLocation | null = null;
  let bestDist = Infinity;

  for (const loc of locations) {
    if (types.length > 0 && !types.includes(loc.type)) continue;
    if (loc.currentNpcs.length >= loc.npcCapacity) continue;

    const dx = loc.x - npc.position.x;
    const dy = loc.y - npc.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = loc;
    }
  }

  return best;
}

/** Pick the best interaction for the NPC's current need */
function pickInteraction(obj: WorldObject, needName: string): ObjectInteraction | null {
  // Prefer interactions that address the specific need
  const matching = obj.interactions.filter(
    i => needName in i.needsAffected && i.needsAffected[needName] < 0,
  );
  if (matching.length > 0) return matching[0];
  // Fallback to first interaction
  return obj.interactions[0] ?? null;
}

export class LocationSystem implements System {
  name = 'LocationSystem';
  worldMap: WorldMapState | null = null;

  setWorldMap(map: WorldMapState): void {
    this.worldMap = map;
  }

  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    if (!this.worldMap) return events;

    const map = this.worldMap;

    for (const npc of world.npcs) {
      let locState = map.npcLocations.get(npc.id);
      if (!locState) {
        locState = {
          npcId: npc.id,
          path: [],
          pathIndex: 0,
          interactionStartTick: 0,
          interactionDuration: 0,
          isInteracting: false,
          moveSpeed: 0.3 + (npc.attributes.dexterity / 10) * 0.3,
        };
        map.npcLocations.set(npc.id, locState);
      }

      // --- If interacting, count down ---
      if (locState.isInteracting) {
        const elapsed = world.tickCount - locState.interactionStartTick;
        if (elapsed >= locState.interactionDuration) {
          // Interaction complete — apply effects
          const obj = map.objects.find(o => o.id === locState!.targetObjectId);
          if (obj) {
            const interaction = pickInteraction(obj, this.getTopNeed(npc));
            if (interaction) {
              // Apply need changes
              for (const [needKey, amount] of Object.entries(interaction.needsAffected)) {
                const key = needKey as keyof typeof npc.needs;
                if (key in npc.needs) {
                  npc.needs[key] = Math.max(0, Math.min(100, npc.needs[key] + amount));
                }
              }
              // Apply skill gains
              if (interaction.skillGain) {
                for (const [skill, xp] of Object.entries(interaction.skillGain)) {
                  const current = npc.skills.get(skill) ?? 0;
                  npc.skills.set(skill, current + xp);
                }
              }

              events.push({
                id: `loc-interact-${world.tickCount}-${npc.id}`,
                tick: world.tickCount,
                gameTime: world.time,
                type: 'behavior',
                actorId: npc.id,
                targetId: obj.id,
                description: `${npc.name} completed ${interaction.name} at ${obj.name}`,
                data: {
                  objectId: obj.id,
                  interaction: interaction.name,
                  needsChanged: interaction.needsAffected,
                },
              });

              // Degrade durability
              if (obj.isDestructible && obj.durability > 0) {
                obj.durability = Math.max(0, obj.durability - 1);
              }
              obj.lastUsedTick = world.tickCount;
            }

            // Release the object
            obj.currentUsers = obj.currentUsers.filter(id => id !== npc.id);
          }

          locState.isInteracting = false;
          locState.targetObjectId = undefined;
        }
        continue; // Still interacting or just finished — skip movement
      }

      // --- If following a path, move along it ---
      if (locState.path.length > 0 && locState.pathIndex < locState.path.length) {
        const target = locState.path[locState.pathIndex];
        const newPos = moveToward(npc.position, target, locState.moveSpeed);
        npc.position.x = newPos.x;
        npc.position.y = newPos.y;

        const dx = target.x - npc.position.x;
        const dy = target.y - npc.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
          locState.pathIndex++;
        }

        // Check if arrived at final destination
        if (locState.pathIndex >= locState.path.length) {
          locState.path = [];
          locState.pathIndex = 0;

          // Start interaction with target object
          const obj = map.objects.find(o => o.id === locState!.targetObjectId);
          if (obj && obj.currentUsers.length < obj.capacity) {
            obj.currentUsers.push(npc.id);
            const interaction = pickInteraction(obj, this.getTopNeed(npc));
            locState.isInteracting = true;
            locState.interactionStartTick = world.tickCount;
            locState.interactionDuration = interaction?.duration ?? 3;

            events.push({
              id: `loc-start-${world.tickCount}-${npc.id}`,
              tick: world.tickCount,
              gameTime: world.time,
              type: 'behavior',
              actorId: npc.id,
              targetId: obj.id,
              description: `${npc.name} started ${interaction?.name ?? 'using'} ${obj.name}`,
            });
          }
        }
        continue;
      }

      // --- No path and not interacting — find a target based on behavior ---
      const behavior = npc.currentBehavior;
      if (!behavior) continue;

      const mapping = BEHAVIOR_OBJECT_MAP[behavior];
      if (!mapping) {
        // No object needed for this behavior — just random walk
        npc.position.x += (world.rng.next() - 0.5) * locState.moveSpeed;
        npc.position.y += (world.rng.next() - 0.5) * locState.moveSpeed;
        // Clamp to world bounds
        npc.position.x = Math.max(0, Math.min(map.config.width - 1, npc.position.x));
        npc.position.y = Math.max(0, Math.min(map.config.height - 1, npc.position.y));
        continue;
      }

      const targetObj = findNearestObject(npc, mapping.categories, map.objects, map);
      if (targetObj) {
        locState.targetObjectId = targetObj.id;

        // Check if already adjacent (within 1.5 tiles)
        const dx = targetObj.x - npc.position.x;
        const dy = targetObj.y - npc.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < 1.5) {
          // Start interacting immediately
          if (targetObj.currentUsers.length < targetObj.capacity) {
            targetObj.currentUsers.push(npc.id);
            const interaction = pickInteraction(targetObj, mapping.need);
            locState.isInteracting = true;
            locState.interactionStartTick = world.tickCount;
            locState.interactionDuration = interaction?.duration ?? 3;
          }
        } else {
          // Pathfind to the object
          const path = findPath(
            { x: Math.round(npc.position.x), y: Math.round(npc.position.y) },
            { x: targetObj.x, y: targetObj.y },
            map.tiles,
            { preferRoads: true },
          );
          if (path && path.length > 0) {
            locState.path = path;
            locState.pathIndex = 0;
          } else {
            // Direct movement fallback
            locState.path = [{ x: targetObj.x, y: targetObj.y }];
            locState.pathIndex = 0;
          }
        }
      }
    }

    return events;
  }

  private getTopNeed(npc: NPC): string {
    let topKey = 'hunger';
    let topVal = -1;
    for (const [key, val] of Object.entries(npc.needs)) {
      if (val > topVal) {
        topVal = val;
        topKey = key;
      }
    }
    return topKey;
  }
}

export const locationSystem = new LocationSystem();
