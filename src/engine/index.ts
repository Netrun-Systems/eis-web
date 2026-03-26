// EIS Web Simulation Engine — Public API
// This module has ZERO React/UI dependencies and can be used in Node.js

export * from './types';
export * from './rng';
export * from './csv-loader';
export * from './simulation';
export * from './world';

// Re-export systems
export { needSystem, tickNeeds, getNeedUrgency } from './systems/need-system';
export { behaviorSystem, selectBehavior, executeBehavior } from './systems/behavior-system';
export { personalitySystem, personalityCompatibility, getTalentPersonalityModifier } from './systems/personality-system';
export { relationshipSystem, evolveTrust, spreadEmotion } from './systems/relationship-system';
export { factionSystem } from './systems/faction-system';
export { economySystem } from './systems/economy-system';
export { knowledgeSystem } from './systems/knowledge-system';
export { questSystem } from './systems/quest-system';
export { scheduleSystem } from './systems/schedule-system';

// New systems
export { combatSystem } from './systems/combat-system';
export { tensionSystem } from './systems/tension-system';
export { playerSystem, createPlayerCharacter, createDefaultPlayer, getVisibleTiles } from './player';
