// ============================================================
// EIS Combat System — Turn-based combat resolution
// Uses NPC attributes (Strength, Dexterity, Endurance) and
// personality traits (aggression, fearfulness, survivalInstinct)
// ============================================================

import type {
  NPC,
  WorldState,
  SimulationEvent,
  System,
  CombatInstance,
  CombatLogEntry,
  SeededRNG,
} from '../types';
import { evolveTrust } from './relationship-system';

// --- Helpers ---

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getNPCsNear(npc: NPC, world: WorldState, tileRadius: number): NPC[] {
  return world.npcs.filter(other => {
    if (other.id === npc.id) return false;
    if (other.isDowned) return false;
    return distance(npc.position, other.position) <= tileRadius;
  });
}

function getWeaponBonus(npc: NPC): number {
  const weapons = ['blade', 'sword', 'axe', 'rifle', 'pistol', 'dagger', 'revolver'];
  for (const item of npc.inventory) {
    const lower = item.toLowerCase();
    if (weapons.some(w => lower.includes(w))) return 3;
  }
  return 0;
}

function getArmorBonus(npc: NPC): number {
  const armors = ['armor', 'vest', 'shield', 'helmet'];
  for (const item of npc.inventory) {
    const lower = item.toLowerCase();
    if (armors.some(a => lower.includes(a))) return 2;
  }
  return 0;
}

function getCombatSkill(npc: NPC): number {
  return npc.skills.get('CombatSkill') ?? npc.skills.get('Skill_CombatSkill') ?? 0;
}

// --- Combat Trigger Evaluation ---

function shouldInitiateCombat(aggressor: NPC, target: NPC, world: WorldState): boolean {
  if (aggressor.isDowned || target.isDowned) return false;
  if (aggressor.isInCombat || target.isInCombat) return false;

  // Check aggression + low patience + unmet safety
  const aggressionTrigger =
    aggressor.personality.aggression > 7 &&
    aggressor.personality.patience < 3 &&
    aggressor.needs.safety > 60;

  // Hostile faction check
  let factionHostile = false;
  for (const gA of aggressor.groupAffiliations) {
    for (const gT of target.groupAffiliations) {
      const rep = world.factionReputations.find(
        r => (r.factionA === gA && r.factionB === gT) ||
             (r.factionA === gT && r.factionB === gA),
      );
      if (rep && rep.reputationLevel <= rep.hostilityThreshold) {
        factionHostile = true;
      }
    }
  }

  // Resource scarcity — desperate aggression
  const desperate = aggressor.needs.hunger > 80 && aggressor.personality.survivalInstinct > 6;

  // Reputation hostility between individuals
  const trust = aggressor.relationships.get(target.id);
  const personalHostile = trust !== undefined && trust < 15; // trust < 1.5 on 0-10 scale

  // Territory intrusion
  let territoryIntrusion = false;
  // If target is in aggressor's faction territory
  for (const gA of aggressor.groupAffiliations) {
    if (!target.groupAffiliations.includes(gA)) {
      // simplified: check if nearby location belongs to aggressor's faction
      const rep = world.factionReputations.find(
        r => r.factionA === gA || r.factionB === gA,
      );
      if (rep && rep.reputationLevel < 30) {
        territoryIntrusion = true;
      }
    }
  }

  if (aggressionTrigger || factionHostile || desperate || personalHostile || territoryIntrusion) {
    // Final probability check modified by personality
    const combatChance =
      (aggressor.personality.aggression / 10) * 0.4 +
      (1 - aggressor.personality.patience / 10) * 0.2 +
      (aggressor.personality.confidence / 10) * 0.2 +
      (factionHostile ? 0.3 : 0) +
      (desperate ? 0.2 : 0) +
      (personalHostile ? 0.2 : 0);

    return world.rng.next() < Math.min(0.8, combatChance);
  }

  return false;
}

// --- Combat Round Resolution ---

function resolveCombatRound(
  attacker: NPC,
  defender: NPC,
  combat: CombatInstance,
  rng: SeededRNG,
): CombatLogEntry[] {
  const entries: CombatLogEntry[] = [];
  combat.round++;

  // --- Attacker's turn ---
  const attackerAction = chooseAction(attacker, combat, rng);

  if (attackerAction === 'flee') {
    const fleeChance =
      ((attacker.personality.fearfulness + attacker.personality.survivalInstinct) / 20) *
      (1 - attacker.currentHealth / attacker.maxHealth);
    if (rng.next() < fleeChance) {
      entries.push({
        round: combat.round,
        actorId: attacker.id,
        action: 'flee',
        roll: 0,
        damage: 0,
        targetHealth: defender.currentHealth,
        description: `${attacker.name} fled from combat!`,
      });
      combat.status = 'fled';
      return entries;
    }
    // Flee failed — wastes turn
    entries.push({
      round: combat.round,
      actorId: attacker.id,
      action: 'flee',
      roll: 0,
      damage: 0,
      targetHealth: defender.currentHealth,
      description: `${attacker.name} tried to flee but couldn't escape!`,
    });
  } else if (attackerAction === 'surrender') {
    entries.push({
      round: combat.round,
      actorId: attacker.id,
      action: 'surrender',
      roll: 0,
      damage: 0,
      targetHealth: defender.currentHealth,
      description: `${attacker.name} surrendered to ${defender.name}!`,
    });
    combat.status = 'resolved';
    return entries;
  } else if (attackerAction === 'defend') {
    entries.push({
      round: combat.round,
      actorId: attacker.id,
      action: 'defend',
      roll: 0,
      damage: 0,
      targetHealth: defender.currentHealth,
      description: `${attacker.name} takes a defensive stance.`,
    });
  } else {
    // Attack
    const attackRoll = rng.nextFloat(0, 1);
    const attackPower =
      attacker.attributes.strength / 2 +
      getCombatSkill(attacker) +
      getWeaponBonus(attacker) +
      attackRoll * 5;

    // Aggression bonus: high aggression = more damage, less defense
    const aggressionBonus = attacker.personality.aggression > 7 ? 2 : 0;

    const defenseRoll = rng.nextFloat(0, 1);
    const defensePower =
      defender.attributes.dexterity / 2 +
      defender.attributes.endurance / 4 +
      getArmorBonus(defender) +
      defenseRoll * 3;

    // Patience bonus for defender: high patience = better defense
    const patienceBonus = defender.personality.patience > 7 ? 2 : 0;

    const totalAttack = attackPower + aggressionBonus;
    const totalDefense = defensePower + patienceBonus;

    let damage = 0;
    if (totalAttack > totalDefense) {
      damage = Math.round(totalAttack - totalDefense);
      damage = Math.max(1, Math.min(damage, 25)); // Clamp damage
      defender.currentHealth = Math.max(0, defender.currentHealth - damage);
    }

    entries.push({
      round: combat.round,
      actorId: attacker.id,
      action: 'attack',
      roll: Math.round(attackRoll * 100),
      damage,
      targetHealth: defender.currentHealth,
      description: damage > 0
        ? `${attacker.name} hits ${defender.name} for ${damage} damage! (HP: ${defender.currentHealth})`
        : `${attacker.name} attacks ${defender.name} but misses!`,
    });
  }

  // --- Defender's turn (if combat not resolved) ---
  if (combat.status !== 'resolved' && combat.status !== 'fled' && defender.currentHealth > 0) {
    const defenderAction = chooseAction(defender, combat, rng);

    if (defenderAction === 'flee') {
      const fleeChance =
        ((defender.personality.fearfulness + defender.personality.survivalInstinct) / 20) *
        (1 - defender.currentHealth / defender.maxHealth);
      if (rng.next() < fleeChance) {
        entries.push({
          round: combat.round,
          actorId: defender.id,
          action: 'flee',
          roll: 0,
          damage: 0,
          targetHealth: attacker.currentHealth,
          description: `${defender.name} fled from combat!`,
        });
        combat.status = 'fled';
        return entries;
      }
      entries.push({
        round: combat.round,
        actorId: defender.id,
        action: 'flee',
        roll: 0,
        damage: 0,
        targetHealth: attacker.currentHealth,
        description: `${defender.name} tried to flee but was blocked!`,
      });
    } else if (defenderAction === 'surrender') {
      entries.push({
        round: combat.round,
        actorId: defender.id,
        action: 'surrender',
        roll: 0,
        damage: 0,
        targetHealth: attacker.currentHealth,
        description: `${defender.name} surrendered to ${attacker.name}!`,
      });
      combat.status = 'resolved';
      return entries;
    } else {
      // Counter-attack
      const attackRoll = rng.nextFloat(0, 1);
      const attackPower =
        defender.attributes.strength / 2 +
        getCombatSkill(defender) +
        getWeaponBonus(defender) +
        attackRoll * 5;
      const aggressionBonus = defender.personality.aggression > 7 ? 2 : 0;

      const defRoll = rng.nextFloat(0, 1);
      const defPower =
        attacker.attributes.dexterity / 2 +
        attacker.attributes.endurance / 4 +
        getArmorBonus(attacker) +
        defRoll * 3;
      const patienceBonus = attacker.personality.patience > 7 ? 2 : 0;

      const totalAttack = attackPower + aggressionBonus;
      const totalDefense = defPower + patienceBonus;

      let damage = 0;
      if (totalAttack > totalDefense) {
        damage = Math.round(totalAttack - totalDefense);
        damage = Math.max(1, Math.min(damage, 25));
        attacker.currentHealth = Math.max(0, attacker.currentHealth - damage);
      }

      entries.push({
        round: combat.round,
        actorId: defender.id,
        action: 'attack',
        roll: Math.round(attackRoll * 100),
        damage,
        targetHealth: attacker.currentHealth,
        description: damage > 0
          ? `${defender.name} counter-attacks ${attacker.name} for ${damage} damage! (HP: ${attacker.currentHealth})`
          : `${defender.name} counter-attacks but misses!`,
      });
    }
  }

  return entries;
}

function chooseAction(
  npc: NPC,
  combat: CombatInstance,
  rng: SeededRNG,
): 'attack' | 'defend' | 'flee' | 'surrender' {
  const healthPct = npc.currentHealth / npc.maxHealth;

  // Surrender check: health < 15% and fearful
  if (healthPct < 0.15 && npc.personality.fearfulness > 5 && rng.next() < 0.6) {
    return 'surrender';
  }

  // Flee check: survival instinct triggers at low health
  if (healthPct < 0.2 && npc.personality.survivalInstinct > 7) {
    return 'flee';
  }
  if (healthPct < 0.3 && npc.personality.fearfulness > 6 && rng.next() < 0.4) {
    return 'flee';
  }

  // High confidence = never flee
  if (npc.personality.confidence > 8) {
    // Defensive stance if patient and hurt
    if (npc.personality.patience > 7 && healthPct < 0.5 && rng.next() < 0.3) {
      return 'defend';
    }
    return 'attack';
  }

  // Patient NPCs sometimes defend
  if (npc.personality.patience > 7 && rng.next() < 0.25) {
    return 'defend';
  }

  return 'attack';
}

// --- Death / Down handling ---

function handleDown(
  downed: NPC,
  killer: NPC,
  world: WorldState,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  downed.isDowned = true;
  downed.isInCombat = false;
  downed.combatId = undefined;

  // Respawn timer based on endurance (higher endurance = faster respawn)
  const respawnTicks = Math.max(20, 100 - downed.attributes.endurance * 5);
  downed.respawnTick = world.tickCount + respawnTicks;

  // Lose inventory (loot drops)
  const lostItems = [...downed.inventory];
  downed.inventory = [];
  const lostGold = downed.gold;
  downed.gold = 0;

  // Killer gains loot
  killer.inventory.push(...lostItems.slice(0, 3)); // Max 3 items
  killer.gold += lostGold;

  // Set emotional state to Fearful after "death"
  downed.emotionalState = 'Fearful';

  // Relationship penalty: trust destroyed between killer and victim's faction
  evolveTrust(downed, killer, 'NegativeInteraction', world);
  evolveTrust(downed, killer, 'NegativeInteraction', world); // Double penalty

  events.push({
    id: `combat-death-${world.tickCount}-${downed.id}`,
    tick: world.tickCount,
    gameTime: world.time,
    type: 'combat_death',
    actorId: downed.id,
    targetId: killer.id,
    description: `${downed.name} was downed by ${killer.name}! Lost ${lostItems.length} items and ${lostGold}g. Respawns in ${respawnTicks} ticks.`,
    data: {
      lostItems,
      lostGold,
      respawnTick: downed.respawnTick,
    },
  });

  // Emotional contagion: witnesses become Fearful
  const witnesses = getNPCsNear(downed, world, 8);
  for (const witness of witnesses) {
    if (witness.id === killer.id) continue;
    if (world.rng.next() < 0.6) {
      witness.emotionalState = 'Fearful';
      events.push({
        id: `combat-witness-${world.tickCount}-${witness.id}`,
        tick: world.tickCount,
        gameTime: world.time,
        type: 'emotion',
        actorId: witness.id,
        targetId: downed.id,
        description: `${witness.name} witnessed ${downed.name}'s defeat and became fearful.`,
        data: { previousEmotion: witness.emotionalState, newEmotion: 'Fearful' },
      });
    }
  }

  return events;
}

// --- Respawn check ---

function processRespawns(world: WorldState): SimulationEvent[] {
  const events: SimulationEvent[] = [];

  for (const npc of world.npcs) {
    if (npc.isDowned && npc.respawnTick && world.tickCount >= npc.respawnTick) {
      npc.isDowned = false;
      npc.currentHealth = npc.maxHealth * 0.5; // Respawn at 50% health
      npc.respawnTick = undefined;
      npc.emotionalState = 'Fearful'; // Still fearful for a while

      // Move to home location (find a safe spot)
      // Simplified: random offset near world center
      npc.position.x = 200 + world.rng.nextFloat(-50, 50);
      npc.position.y = 300 + world.rng.nextFloat(-50, 50);

      events.push({
        id: `respawn-${world.tickCount}-${npc.id}`,
        tick: world.tickCount,
        gameTime: world.time,
        type: 'system',
        actorId: npc.id,
        description: `${npc.name} has respawned at ${Math.round(npc.currentHealth)} HP.`,
        data: { health: npc.currentHealth },
      });
    }
  }

  return events;
}

// --- Main Combat System ---

export class CombatSystem implements System {
  name = 'CombatSystem';

  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Initialize runtime arrays if needed
    if (!world.activeCombats) world.activeCombats = [];

    // 1. Process respawns
    events.push(...processRespawns(world));

    // 2. Check for new combat initiations (every 3 ticks for performance)
    if (world.tickCount % 3 === 0) {
      for (const npc of world.npcs) {
        if (npc.isDowned || npc.isInCombat) continue;

        const nearby = getNPCsNear(npc, world, 3);
        for (const other of nearby) {
          if (other.isInCombat || other.isDowned) continue;

          if (shouldInitiateCombat(npc, other, world)) {
            const combat: CombatInstance = {
              id: `combat-${world.tickCount}-${npc.id}-${other.id}`,
              attackerId: npc.id,
              defenderId: other.id,
              location: { x: (npc.position.x + other.position.x) / 2, y: (npc.position.y + other.position.y) / 2 },
              round: 0,
              status: 'engaging',
              combatLog: [],
              startTick: world.tickCount,
            };

            world.activeCombats.push(combat);
            npc.isInCombat = true;
            npc.combatId = combat.id;
            other.isInCombat = true;
            other.combatId = combat.id;

            events.push({
              id: `combat-start-${world.tickCount}-${npc.id}`,
              tick: world.tickCount,
              gameTime: world.time,
              type: 'combat_start',
              actorId: npc.id,
              targetId: other.id,
              description: `${npc.name} attacks ${other.name}!`,
              data: { combatId: combat.id },
            });

            break; // One combat initiation per NPC per tick
          }
        }
      }
    }

    // 3. Process active combats
    const resolvedCombats: string[] = [];

    for (const combat of world.activeCombats) {
      if (combat.status === 'resolved' || combat.status === 'fled') {
        resolvedCombats.push(combat.id);
        continue;
      }

      const attacker = world.npcs.find(n => n.id === combat.attackerId);
      const defender = world.npcs.find(n => n.id === combat.defenderId);
      if (!attacker || !defender) {
        resolvedCombats.push(combat.id);
        continue;
      }

      // Transition from engaging to fighting
      if (combat.status === 'engaging') {
        combat.status = 'fighting';
      }

      // Resolve one round per tick
      const roundEntries = resolveCombatRound(attacker, defender, combat, world.rng);
      combat.combatLog.push(...roundEntries);

      for (const entry of roundEntries) {
        events.push({
          id: `combat-round-${world.tickCount}-${combat.id}-${entry.round}-${entry.actorId}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'combat_round',
          actorId: entry.actorId,
          targetId: entry.actorId === attacker.id ? defender.id : attacker.id,
          description: entry.description,
          data: {
            combatId: combat.id,
            round: entry.round,
            action: entry.action,
            damage: entry.damage,
            roll: entry.roll,
          },
        });
      }

      // Check for downed combatants
      if (attacker.currentHealth <= 0) {
        combat.status = 'resolved';
        combat.resolutionTick = world.tickCount;
        events.push(...handleDown(attacker, defender, world));
        defender.isInCombat = false;
        defender.combatId = undefined;
        resolvedCombats.push(combat.id);

        events.push({
          id: `combat-end-${world.tickCount}-${combat.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'combat_end',
          actorId: defender.id,
          targetId: attacker.id,
          description: `${defender.name} defeated ${attacker.name}!`,
          data: { combatId: combat.id, winnerId: defender.id },
        });
      } else if (defender.currentHealth <= 0) {
        combat.status = 'resolved';
        combat.resolutionTick = world.tickCount;
        events.push(...handleDown(defender, attacker, world));
        attacker.isInCombat = false;
        attacker.combatId = undefined;
        resolvedCombats.push(combat.id);

        events.push({
          id: `combat-end-${world.tickCount}-${combat.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'combat_end',
          actorId: attacker.id,
          targetId: defender.id,
          description: `${attacker.name} defeated ${defender.name}!`,
          data: { combatId: combat.id, winnerId: attacker.id },
        });
      }

      // Check status changes from combat round resolution (fled / surrender)
      const currentStatus = combat.status as string;
      if (currentStatus === 'fled' && !resolvedCombats.includes(combat.id)) {
        combat.resolutionTick = world.tickCount;
        attacker.isInCombat = false;
        attacker.combatId = undefined;
        defender.isInCombat = false;
        defender.combatId = undefined;
        resolvedCombats.push(combat.id);

        const fleerId = roundEntries.find(e => e.action === 'flee')?.actorId;
        events.push({
          id: `combat-flee-${world.tickCount}-${combat.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'combat_flee',
          actorId: fleerId ?? attacker.id,
          description: `Combat ended — someone fled!`,
          data: { combatId: combat.id },
        });
      } else if (currentStatus === 'resolved' && !resolvedCombats.includes(combat.id)) {
        // Surrender
        combat.resolutionTick = world.tickCount;
        attacker.isInCombat = false;
        attacker.combatId = undefined;
        defender.isInCombat = false;
        defender.combatId = undefined;
        resolvedCombats.push(combat.id);

        events.push({
          id: `combat-end-${world.tickCount}-${combat.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'combat_end',
          actorId: attacker.id,
          targetId: defender.id,
          description: `Combat resolved — surrender!`,
          data: { combatId: combat.id },
        });
      }

      // Max rounds safety: 20 rounds
      if (combat.round >= 20 && combat.status === 'fighting') {
        combat.status = 'resolved';
        combat.resolutionTick = world.tickCount;
        attacker.isInCombat = false;
        attacker.combatId = undefined;
        defender.isInCombat = false;
        defender.combatId = undefined;
        resolvedCombats.push(combat.id);
      }
    }

    // Clean up resolved combats (keep last 50 for history)
    world.activeCombats = world.activeCombats.filter(
      c => !resolvedCombats.includes(c.id) || world.tickCount - (c.resolutionTick ?? 0) < 200,
    );

    return events;
  }
}

export const combatSystem = new CombatSystem();
