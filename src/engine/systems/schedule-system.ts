import type { NPC, WorldState, SimulationEvent, System } from '../types';

/**
 * Schedule system: NPCs follow time-of-day schedules based on their roles.
 */

type TimeOfDay = 'EarlyMorning' | 'Morning' | 'Afternoon' | 'Evening' | 'Night';

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 4 && hour < 7) return 'EarlyMorning';
  if (hour >= 7 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

function matchPeriod(period: string, timeOfDay: TimeOfDay): boolean {
  const p = period.toLowerCase().replace(/\s/g, '');
  const t = timeOfDay.toLowerCase();
  return p.includes(t) || p.includes('early morning') && t === 'earlymorning';
}

/**
 * Get the current scheduled activity for an NPC.
 */
function getScheduledActivity(npc: NPC, world: WorldState): string | null {
  const timeOfDay = getTimeOfDay(world.hour);

  // Find matching schedule for NPC's roles
  for (const role of npc.assignedRoles) {
    const schedule = world.schedules.find(s =>
      s.associatedRoles.some(r => r === role || r.includes(role))
    );

    if (schedule) {
      for (const slot of schedule.timeSlots) {
        if (matchPeriod(slot.period, timeOfDay)) {
          return slot.activity;
        }
      }
    }
  }

  // Default schedule based on time of day
  switch (timeOfDay) {
    case 'Night':
      return 'Sleep';
    case 'EarlyMorning':
      return 'Prepare';
    default:
      return null; // Let other systems decide
  }
}

/**
 * Apply movement based on schedule (move toward home at night, work during day).
 */
function applyScheduleMovement(npc: NPC, activity: string, world: WorldState): void {
  const speed = 2 + world.rng.nextFloat(-0.5, 0.5);
  const dx = (world.rng.next() - 0.5) * speed;
  const dy = (world.rng.next() - 0.5) * speed;

  npc.position.x = Math.max(10, Math.min(790, npc.position.x + dx));
  npc.position.y = Math.max(10, Math.min(590, npc.position.y + dy));
}

export const scheduleSystem: System = {
  name: 'ScheduleSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Update world time
    world.time += deltaTime;
    world.hour = Math.floor(world.time % 24);
    world.day = Math.floor(world.time / 24) + 1;

    for (const npc of world.npcs) {
      const activity = getScheduledActivity(npc, world);

      if (activity) {
        // Apply rest effects for sleeping
        if (activity === 'Sleep' || activity === 'Rest') {
          npc.needs.rest = Math.max(0, npc.needs.rest - 5 * deltaTime);
          npc.needs.energy = Math.min(100, (npc.needs.energy ?? 50) + 3 * deltaTime);
        }
      }

      // Move NPCs around
      applyScheduleMovement(npc, activity || 'Idle', world);
    }

    // Emit time events at day boundaries
    if (world.hour === 6 && world.tickCount > 0) {
      events.push({
        id: `time-dawn-${world.day}`,
        tick: world.tickCount,
        gameTime: world.time,
        type: 'system',
        actorId: 'world',
        description: `Day ${world.day} begins`,
        data: { day: world.day, hour: world.hour },
      });
    }

    return events;
  },
};
