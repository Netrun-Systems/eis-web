import Papa from 'papaparse';
import type {
  NPC, NPCAttributes, PersonalityTraits, NPCNeeds, TalentProfile,
  Need, Behavior, Action, Trait, Talent, Emotion,
  EmotionalContagionRule, TrustEvolutionParameter, Relationship,
  FactionDefinition, FactionRelation, FactionReputation,
  Item, Quest, Role, Skill, Knowledge, Memory,
  Schedule, ScheduleSlot, EnvironmentCondition, WeatherCondition,
  WorldEvent, Dialogue, WorldState, ContagionType, ItemAvailability,
} from './types';
import { createRNG } from './rng';

// ---- Generic CSV parser ----

function parseCSVText<T = Record<string, string>>(csvText: string): T[] {
  const result = Papa.parse<T>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  });
  return result.data;
}

async function fetchCSV<T = Record<string, string>>(path: string): Promise<T[]> {
  const resp = await fetch(path);
  if (!resp.ok) {
    console.warn(`Failed to fetch CSV: ${path} (${resp.status})`);
    return [];
  }
  const text = await resp.text();
  return parseCSVText<T>(text);
}

// ---- Helpers ----

function num(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === '' || v === 'N/A' || v === 'None' || v === 'Infinite' || v === 'Unknown') return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function bool(v: string | undefined): boolean {
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1';
}

function splitSemicolon(v: string | undefined): string[] {
  if (!v || v === 'None' || v === 'N/A') return [];
  return v.split(';').map(s => s.trim()).filter(Boolean);
}

function parseKeyValuePairs(v: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!v || v === 'None' || v === 'N/A') return map;
  const pairs = v.split(';');
  for (const pair of pairs) {
    const [key, val] = pair.split('=');
    if (key && val) {
      map.set(key.trim(), num(val.trim()));
    }
  }
  return map;
}

function parseRelationships(v: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!v || v === 'None' || v === 'N/A') return map;
  const pairs = v.split(';');
  for (const pair of pairs) {
    const [key, val] = pair.split('=');
    if (key && val) {
      map.set(key.trim(), num(val.trim()));
    }
  }
  return map;
}

function parseRequirements(v: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!v || v === 'None' || v === 'N/A') return map;
  const parts = v.split(';');
  for (const part of parts) {
    const match = part.match(/(\w+)\s*>=?\s*(\d+)/);
    if (match) {
      map.set(match[1].trim(), num(match[2]));
    }
  }
  return map;
}

function parsePersonalityInfluence(v: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!v || v === 'None' || v === 'N/A') return map;
  const parts = v.split(';');
  for (const part of parts) {
    const match = part.match(/(\w+)\s*>=?\s*(\d+)/);
    if (match) {
      map.set(match[1].trim(), num(match[2]));
    }
  }
  return map;
}

function parseScheduleSlots(v: string | undefined): ScheduleSlot[] {
  if (!v) return [];
  const parts = v.split(';');
  return parts.map(p => {
    const [period, activity] = p.split(':').map(s => s.trim());
    return { period: period || '', activity: activity || '' };
  }).filter(s => s.period && s.activity);
}

function parseNeedModifiers(v: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!v || v === '' || v === 'None') return map;
  const parts = v.split(';');
  for (const part of parts) {
    const [key, val] = part.split(':');
    if (key && val) {
      map.set(key.trim(), num(val.trim()));
    }
  }
  return map;
}

// ---- Type-specific parsers ----

function parseNPCs(rows: Record<string, string>[]): NPC[] {
  return rows.map((r) => {
    const attributes: NPCAttributes = {
      strength: num(r['Strength']),
      dexterity: num(r['Dexterity']),
      endurance: num(r['Endurance']),
      health: num(r['Health']),
      intelligence: num(r['Intelligence']),
      wisdom: num(r['Wisdom']),
      willpower: num(r['Willpower']),
      charisma: num(r['Charisma']),
    };

    const personality: PersonalityTraits = {
      aggression: num(r['Aggression']),
      friendliness: num(r['Friendliness']),
      curiosity: num(r['Curiosity']),
      fearfulness: num(r['Fearfulness']),
      loyalty: num(r['Loyalty']),
      independence: num(r['Independence']),
      confidence: num(r['Confidence']),
      patience: num(r['Patience']),
      honesty: num(r['Honesty']),
      empathy: num(r['Empathy']),
      resourcefulness: num(r['Resourcefulness']),
      greed: num(r['Greed']),
      generosity: num(r['Generosity']),
      survivalInstinct: num(r['SurvivalInstinct']),
    };

    const needs: NPCNeeds = {
      hunger: num(r['Hunger'], 50),
      thirst: num(r['Thirst'], 50),
      rest: num(r['Rest'], 50),
      socialInteraction: num(r['SocialInteraction'], 50),
      energy: num(r['Energy'], 50),
      hygiene: num(r['Hygiene'], 50),
      comfort: num(r['Comfort'], 50),
      safety: 50,
      selfActualization: 30,
      entertainment: 40,
    };

    return {
      id: r['NPC_ID'] || '',
      name: r['Name'] || '',
      species: r['Species'] || 'Human',
      age: r['Age'] || 'Unknown',
      gender: r['Gender'] || 'Unknown',
      attributes,
      personality,
      needs,
      memoryDecayRate: num(r['MemoryDecayRate'], 0.01),
      knowledgeCapacity: num(r['KnowledgeCapacity'], 100),
      emotionalState: r['EmotionalState'] || 'Neutral',
      groupAffiliations: splitSemicolon(r['GroupAffiliations']),
      assignedRoles: splitSemicolon(r['AssignedRoles']),
      homeLocation: r['HomeLocation'] || '',
      workLocation: r['WorkLocation'] || '',
      knownRisks: splitSemicolon(r['KnownRisks']),
      needsHome: bool(r['NeedsHome']),
      needsWork: bool(r['NeedsWork']),
      needsRiskInfo: bool(r['NeedsRiskInfo']),
      awarenessLevel: r['AwarenessLevel'] || 'Active',
      dialogueOptions: splitSemicolon(r['DialogueOptions']),
      relationships: parseRelationships(r['Relationships']),
      culturalTraits: parseKeyValuePairs(r['CulturalTraits']),
      inventory: splitSemicolon(r['Inventory']),
      skills: parseKeyValuePairs(r['Skills']),
      knowledgeBase: splitSemicolon(r['KnowledgeBase']),
      currentBehavior: null,
      position: { x: Math.random() * 800, y: Math.random() * 600 },
      talentProfile: { topFive: [], all: new Map() },
      // Combat / player fields
      currentHealth: attributes.health + attributes.endurance * 3,
      maxHealth: attributes.health + attributes.endurance * 3,
      isInCombat: false,
      isDowned: false,
      gold: 10 + Math.floor(Math.random() * 40),
    };
  });
}

function parseNeeds(rows: Record<string, string>[]): Need[] {
  return rows.map(r => ({
    id: num(r['NeedID']),
    name: r['NeedName'] || '',
    description: r['Description'] || '',
    defaultValue: num(r['DefaultValue'], 50),
    increaseRate: num(r['IncreaseRate'], 0.05),
    priorityWeight: num(r['PriorityWeight'], 5),
    modifiers: r['Modifiers'] || '',
    satisfactionThreshold: num(r['SatisfactionThresholds'], 70),
  }));
}

function parseBehaviors(rows: Record<string, string>[]): Behavior[] {
  return rows.map(r => ({
    id: num(r['BehaviorID']),
    name: r['BehaviorName'] || '',
    description: r['Description'] || '',
    associatedNeeds: splitSemicolon(r['AssociatedNeeds']).map(Number).filter(n => !isNaN(n)),
    requiredAttributes: parseRequirements(r['RequiredAttributesSkills']),
    personalityInfluence: parsePersonalityInfluence(r['PersonaTraitsInfluence']),
    conditions: splitSemicolon(r['Conditions']),
    effects: parseRequirements(r['Effects']),
    animationReference: r['AnimationActionReferences'] || '',
  }));
}

function parseActions(rows: Record<string, string>[]): Action[] {
  return rows.map(r => ({
    id: num(r['ActionID']),
    name: r['ActionName'] || '',
    description: r['Description'] || '',
    affectedNeeds: r['AffectedNeeds'] || '',
    attributeChanges: r['AttributeChanges'] || '',
    relationshipImpact: r['RelationshipImpact'] || '',
    behaviorId: num(r['BehaviorID']),
  }));
}

function parseTraits(rows: Record<string, string>[]): Trait[] {
  return rows.map(r => ({
    id: num(r['TraitID']),
    name: r['TraitName'] || '',
    description: r['Description'] || '',
    effectOnBehaviors: r['EffectOnBehaviors'] || '',
    defaultValue: num(r['DefaultValue'], 5),
    rangeMin: num(r['RangeMin'], 1),
    rangeMax: num(r['RangeMax'], 10),
  }));
}

function parseTalents(rows: Record<string, string>[]): Talent[] {
  return rows.map(r => ({
    id: r['TalentID'] || '',
    name: r['TalentName'] || '',
    domain: (r['Domain'] || 'Executing') as Talent['domain'],
    coreDefinition: r['CoreDefinition'] || '',
    brings: r['Brings'] || '',
    needs: r['Needs'] || '',
    potentialBlindSpot: r['PotentialBlindSpot'] || '',
  }));
}

function parseEmotions(rows: Record<string, string>[]): Emotion[] {
  return rows.map(r => ({
    id: num(r['EmotionID']),
    name: r['EmotionName'] || '',
    description: r['Description'] || '',
    triggers: r['Triggers'] || '',
    effectsOnBehaviors: r['EffectsOnBehaviors'] || '',
    duration: r['Duration'] || 'Variable',
  }));
}

function parseEmotionalContagionRules(rows: Record<string, string>[]): EmotionalContagionRule[] {
  return rows.map(r => ({
    ruleId: num(r['RuleID']),
    sourceEmotion: r['SourceEmotion'] || '',
    contagionType: (r['ContagionType'] || 'DirectContagion') as ContagionType,
    baseContagionStrength: num(r['BaseContagionStrength']),
    relationshipStrengthMultiplier: num(r['RelationshipStrengthMultiplier'], 1),
    personalityOpennessFactor: num(r['PersonalityOpennessFactor'], 1),
    distanceDecayRate: num(r['DistanceDecayRate'], 0.2),
    maxPropagationDistance: num(r['MaxPropagationDistance'], 3),
    durationMultiplier: num(r['DurationMultiplier'], 1),
    resistanceThreshold: num(r['ResistanceThreshold'], 0.3),
    factionAmplificationFactor: num(r['FactionAmplificationFactor'], 1),
  }));
}

function parseTrustEvolutionParameters(rows: Record<string, string>[]): TrustEvolutionParameter[] {
  return rows.map(r => ({
    parameterId: num(r['ParameterID']),
    eventType: r['EventType'] || '',
    baseTrustChange: num(r['BaseTrustChange']),
    personalityMultiplier: num(r['PersonalityMultiplier'], 1),
    timeDecayFactor: num(r['TimeDecayFactor'], 0.01),
    diminishingReturnsFactor: num(r['DiminishingReturnsFactor'], 0.8),
    maxChangePerEvent: num(r['MaxChangePerEvent'], 20),
    recoveryDifficulty: num(r['RecoveryDifficulty'], 1),
    witnessImpactMultiplier: num(r['WitnessImpactMultiplier'], 0.3),
    factionInfluenceWeight: num(r['FactionInfluenceWeight'], 0.5),
  }));
}

function parseRelationshipsCSV(rows: Record<string, string>[]): Relationship[] {
  return rows.map(r => {
    const entities = splitSemicolon(r['EntitiesInvolved']);
    const trustLevel = num(r['InitialTrustLevel'], 5);
    return {
      id: num(r['RelationshipID']),
      entities: [entities[0] || '', entities[1] || ''] as [string, string],
      initialTrustLevel: trustLevel,
      currentTrustLevel: trustLevel,
      perceptionModifiers: r['PerceptionModifiers'] || '',
      historyNotes: r['HistoryNotes'] || '',
    };
  });
}

function parseFactionDefinitions(rows: Record<string, string>[]): FactionDefinition[] {
  return rows.map(r => ({
    id: num(r['GroupID']),
    name: r['GroupName'] || '',
    description: r['Description'] || '',
    territory: r['Territory'] || '',
    leadership: r['Leadership'] || '',
    population: r['Population'] || '',
    resources: r['Resources'] || '',
  }));
}

function parseFactionRelations(rows: Record<string, string>[]): FactionRelation[] {
  return rows.map(r => ({
    pairId: num(r['GroupPairID']),
    groupA: r['GroupA'] || '',
    groupB: r['GroupB'] || '',
    relationshipStatus: r['RelationshipStatus'] || 'Neutral',
    trustLevel: num(r['TrustLevel'], 5),
    historyNotes: r['HistoryNotes'] || '',
  }));
}

function parseFactionReputations(rows: Record<string, string>[]): FactionReputation[] {
  return rows.map(r => ({
    entryId: num(r['EntryID']),
    factionA: r['FactionA'] || '',
    factionB: r['FactionB'] || '',
    reputationLevel: num(r['ReputationLevel'], 50),
    reputationChangeRate: num(r['ReputationChangeRate'], 0.3),
    reputationDecayRate: num(r['ReputationDecayRate'], 0.02),
    publicStanding: num(r['PublicStanding'], 50),
    tradeRelationshipModifier: num(r['TradeRelationshipModifier'], 1),
    hostilityThreshold: num(r['HostilityThreshold'], 20),
    allianceThreshold: num(r['AllianceThreshold'], 75),
    reputationMomentum: num(r['ReputationMomentum']),
    lastSignificantEvent: r['LastSignificantEvent'] || '',
    eventImpactDecayRate: num(r['EventImpactDecayRate'], 0.03),
  }));
}

function parseItems(rows: Record<string, string>[]): Item[] {
  return rows.map(r => ({
    id: num(r['ItemID']),
    name: r['ItemName'] || '',
    description: r['Description'] || '',
    itemType: r['ItemType'] || 'Misc',
    effects: r['Effects'] || '',
    value: num(r['Value']),
    availability: (r['Availability'] || 'Common') as ItemAvailability,
  }));
}

function parseQuests(rows: Record<string, string>[]): Quest[] {
  return rows.map(r => ({
    faction: r['Faction'] || '',
    name: r['Quest Name'] || '',
    description: r['Quest Description'] || '',
    successConditions: r['Success Conditions'] || '',
    requirements: r['Requirements'] || '',
    rewards: r['Rewards'] || '',
    status: 'available' as const,
  }));
}

function parseRoles(rows: Record<string, string>[]): Role[] {
  return rows.map(r => ({
    id: num(r['RoleID']),
    name: r['RoleName'] || '',
    description: r['Description'] || '',
    keyResponsibilities: splitSemicolon(r['KeyResponsibilities']),
    requiredSkills: splitSemicolon(r['RequiredSkills']),
  }));
}

function parseSkills(rows: Record<string, string>[]): Skill[] {
  return rows.map(r => {
    const modifiers = new Map<string, string>();
    const modStr = r['AttributeModifiers'] || '';
    for (const part of modStr.split(';')) {
      const [k, v] = part.split(':');
      if (k && v) modifiers.set(k.trim(), v.trim());
    }
    return {
      id: r['SkillID'] || '',
      name: r['SkillName'] || '',
      description: r['Description'] || '',
      requirements: r['Requirements'] || '',
      associatedAttributes: splitSemicolon(r['AssociatedAttributes']),
      attributeModifiers: modifiers,
      effectOnBehaviors: r['EffectOnBehaviors'] || '',
    };
  });
}

function parseKnowledge(rows: Record<string, string>[]): Knowledge[] {
  return rows.map(r => ({
    faction: r['Faction'] || '',
    type: r['Knowledge Type'] || '',
    description: r['Knowledge Description'] || '',
    howLearned: r['How It Can Be Learned or Exchanged'] || '',
    plotImpact: r['Impact on Plot Development'] || '',
  }));
}

function parseMemories(rows: Record<string, string>[]): Memory[] {
  return rows.map(r => ({
    id: num(r['MemoryID']),
    knowledgeType: r['KnowledgeType'] || '',
    description: r['Description'] || '',
    associatedData: r['AssociatedData'] || '',
    expiration: r['Expiration'] || '',
  }));
}

function parseSchedules(rows: Record<string, string>[]): Schedule[] {
  return rows.map(r => ({
    id: num(r['ScheduleID']),
    name: r['ScheduleName'] || '',
    description: r['Description'] || '',
    timeSlots: parseScheduleSlots(r['TimeSlots']),
    associatedRoles: splitSemicolon(r['AssociatedRoles']),
    conditions: r['Conditions'] || '',
  }));
}

function parseEnvironmentConditions(rows: Record<string, string>[]): EnvironmentCondition[] {
  return rows.map(r => ({
    id: num(r['EnvironmentID']),
    name: r['ConditionName'] || '',
    description: r['Description'] || '',
    effectsOnBehaviors: r['EffectsOnBehaviors'] || '',
    duration: r['Duration'] || '',
    triggerConditions: r['TriggerConditions'] || '',
  }));
}

function parseWeatherConditions(rows: Record<string, string>[]): WeatherCondition[] {
  return rows.map(r => ({
    id: num(r['EnvironmentID']),
    name: r['ConditionName'] || '',
    weatherType: num(r['WeatherType']),
    intensity: num(r['Intensity']),
    duration: num(r['Duration'], 3600),
    comfortModifier: num(r['ComfortModifier']),
    visibilityRange: num(r['VisibilityRange'], 10000),
    temperatureModifier: num(r['TemperatureModifier']),
    humidityLevel: num(r['HumidityLevel']),
    windStrength: num(r['WindStrength']),
    affectsNPCBehavior: bool(r['bAffectsNPCBehavior']),
    affectsInteractiveObjects: bool(r['bAffectsInteractiveObjects']),
    blocksOutdoorActivities: bool(r['bBlocksOutdoorActivities']),
    cloudCoverage: num(r['CloudCoverage']),
    precipitation: num(r['Precipitation']),
    needModifiers: parseNeedModifiers(r['NeedModifiers']),
    triggerConditions: r['TriggerConditions'] || '',
  }));
}

function parseWorldEvents(rows: Record<string, string>[]): WorldEvent[] {
  return rows.map(r => ({
    id: num(r['EventID']),
    name: r['EventName'] || '',
    description: r['Description'] || '',
    schedule: r['Schedule'] || '',
    requiredRoles: splitSemicolon(r['RequiredRoles']),
    benefits: r['Benefits'] || '',
    participationRequirements: r['ParticipationRequirements'] || '',
  }));
}

function parseDialogues(rows: Record<string, string>[]): Dialogue[] {
  return rows.map(r => ({
    id: num(r['DialogueID']),
    text: r['DialogueText'] || '',
    speakerRole: r['SpeakerRole'] || '',
    conditions: r['Conditions'] || '',
    responses: splitSemicolon(r['Responses']),
    effects: r['Effects'] || '',
  }));
}

// ---- Master loader ----

export async function loadAllData(basePath = '/data'): Promise<WorldState> {
  const [
    npcRows, needRows, behaviorRows, actionRows, traitRows, talentRows,
    emotionRows, contagionRows, trustRows, relationshipRows,
    factionDefRows, factionRelRows, factionRepRows,
    itemRows, questRows, roleRows, skillRows, knowledgeRows,
    memoryRows, scheduleRows, envRows, weatherRows, eventRows, dialogueRows,
  ] = await Promise.all([
    fetchCSV(`${basePath}/NPCs.csv`),
    fetchCSV(`${basePath}/Needs.csv`),
    fetchCSV(`${basePath}/Behavior.csv`),
    fetchCSV(`${basePath}/Action.csv`),
    fetchCSV(`${basePath}/Traits.csv`),
    fetchCSV(`${basePath}/Talents.csv`),
    fetchCSV(`${basePath}/Emotions.csv`),
    fetchCSV(`${basePath}/EmotionalContagionRules.csv`),
    fetchCSV(`${basePath}/TrustEvolutionParameters.csv`),
    fetchCSV(`${basePath}/Relationship.csv`),
    fetchCSV(`${basePath}/Groups_Definitions.csv`),
    fetchCSV(`${basePath}/Groups.csv`),
    fetchCSV(`${basePath}/FactionReputationMatrix.csv`),
    fetchCSV(`${basePath}/Item.csv`),
    fetchCSV(`${basePath}/Quests.csv`),
    fetchCSV(`${basePath}/Roles.csv`),
    fetchCSV(`${basePath}/Skills.csv`),
    fetchCSV(`${basePath}/Knowledge.csv`),
    fetchCSV(`${basePath}/Memory.csv`),
    fetchCSV(`${basePath}/Schedule.csv`),
    fetchCSV(`${basePath}/Environment.csv`),
    fetchCSV(`${basePath}/WeatherConditions.csv`),
    fetchCSV(`${basePath}/Event.csv`),
    fetchCSV(`${basePath}/Dialogue.csv`),
  ]);

  const rng = createRNG(42);

  const npcs = parseNPCs(npcRows);
  // Assign deterministic positions
  for (const npc of npcs) {
    npc.position = { x: rng.nextFloat(50, 750), y: rng.nextFloat(50, 550) };
  }

  return {
    npcs,
    needs: parseNeeds(needRows),
    behaviors: parseBehaviors(behaviorRows),
    actions: parseActions(actionRows),
    traits: parseTraits(traitRows),
    talents: parseTalents(talentRows),
    emotions: parseEmotions(emotionRows),
    emotionalContagionRules: parseEmotionalContagionRules(contagionRows),
    trustEvolutionParameters: parseTrustEvolutionParameters(trustRows),
    relationships: parseRelationshipsCSV(relationshipRows),
    factions: parseFactionDefinitions(factionDefRows),
    factionRelations: parseFactionRelations(factionRelRows),
    factionReputations: parseFactionReputations(factionRepRows),
    items: parseItems(itemRows),
    quests: parseQuests(questRows),
    roles: parseRoles(roleRows),
    skills: parseSkills(skillRows),
    knowledge: parseKnowledge(knowledgeRows),
    memories: parseMemories(memoryRows),
    schedules: parseSchedules(scheduleRows),
    environmentConditions: parseEnvironmentConditions(envRows),
    weatherConditions: parseWeatherConditions(weatherRows),
    events: parseWorldEvents(eventRows),
    dialogues: parseDialogues(dialogueRows),
    time: 0,
    day: 1,
    hour: 6, // Start at 6 AM
    currentWeather: null,
    activeEvents: [],
    eventLog: [],
    tickCount: 0,
    rng,
    // Combat & tension runtime
    activeCombats: [],
    activeTensions: [],
    // Economy runtime
    markets: [],
    activeNegotiations: [],
    // Player
    playerActionQueue: [],
  };
}

export { parseCSVText, fetchCSV };
