import { describe, expect, it } from 'vitest';
import {
  applyRowEdit,
  groupColumns,
  groupNpcColumns,
  groupQuestColumns,
  measurePickerViability,
  OTHER_SECTION_TITLE,
  resolveReferenceTokens,
} from '../entityForm';

/** The REAL Data/Core/NPCs.csv header (83 columns), verbatim. */
const NPC_HEADER =
  'NPC_ID,Name,Species,Age,Gender,BodyType,HeadID,AppearanceProfile,Strength,Dexterity,' +
  'Endurance,Health,Intelligence,Wisdom,Willpower,Charisma,Aggression,Friendliness,Curiosity,' +
  'Fearfulness,Loyalty,Independence,Confidence,Patience,Honesty,Empathy,Resourcefulness,Greed,' +
  'Generosity,SurvivalInstinct,Hunger,Thirst,Rest,SocialInteraction,Energy,Hygiene,Comfort,' +
  'MemoryDecayRate,KnowledgeCapacity,EmotionalState,GroupAffiliations,AssignedRoles,' +
  'HomeLocation,WorkLocation,KnownRisks,NeedsHome,NeedsWork,NeedsRiskInfo,AwarenessLevel,' +
  'DialogueOptions,Relationships,CulturalTraits,Inventory,Skills,KnowledgeBase,PrimaryDomain,' +
  'SecondaryDomain,DomainSpecialization,EnvironmentalNeeds,EnvironmentalContributions,' +
  'SignatureTraits,BlindSpotTraits,TalentProfile_Top5,TalentProfile_Full,InvestmentLevels,' +
  'SignatureTalent,BlindSpotTalent,ExecutingStrength,InfluencingStrength,RelationshipStrength,' +
  'StrategicStrength,RadiationResistance,HeatResistance,CurrentRadiation,CurrentHeatStress,' +
  'MutationLevel,ActiveMutations,WaterReserve,HomeBiome,EnvironmentPreferences,PersonalityRank,' +
  'TalentInvestment,BodyPoolRow';

/** The REAL Data/Quest/Quests.csv header (19 columns), verbatim. */
const QUEST_HEADER =
  'QuestID,Faction,QuestName,QuestDescription,QuestType,SuccessConditions,Requirements,Rewards,' +
  'TimeLimit,ExperienceReward,GoldReward,Prerequisites,FailureConditions,IsRepeatable,' +
  'CooldownTime,QuestGiver,QuestLocation,DifficultyLevel,Status';

describe('groupNpcColumns — the 83 real columns, grouped stably', () => {
  const columns = NPC_HEADER.split(',');

  it('covers all 83 columns exactly once, with no Other section', () => {
    expect(columns).toHaveLength(83);
    const sections = groupNpcColumns(columns);
    const total = sections.reduce((sum, s) => sum + s.indexes.length, 0);
    expect(total).toBe(83);
    const seen = new Set(sections.flatMap((s) => s.indexes));
    expect(seen.size).toBe(83);
    expect(sections.some((s) => s.title === OTHER_SECTION_TITLE)).toBe(false);
  });

  it('produces the derived section names and counts, in order', () => {
    const sections = groupNpcColumns(columns);
    expect(sections.map((s) => [s.title, s.indexes.length])).toEqual([
      ['Identity', 5],
      ['Appearance', 4],
      ['Attributes', 8],
      ['Personality traits', 14],
      ['Needs', 7],
      ['Mind & memory', 5],
      ['World placement', 9],
      ['Social & dialogue', 3],
      ['Inventory & skills', 2],
      ['Talents & domains', 16],
      ['Environment & survival', 10],
    ]);
  });

  it('is stable: same header, same grouping', () => {
    expect(groupNpcColumns(columns)).toEqual(groupNpcColumns([...columns]));
  });

  it('puts an unknown future column into an honest Other section', () => {
    const sections = groupNpcColumns([...columns, 'BrandNewColumn']);
    const other = sections.find((s) => s.title === OTHER_SECTION_TITLE);
    expect(other).toBeDefined();
    expect(other?.indexes).toEqual([83]);
    const total = sections.reduce((sum, s) => sum + s.indexes.length, 0);
    expect(total).toBe(84);
  });
});

describe('groupQuestColumns — the 19 real columns', () => {
  it('covers all 19 columns, no Other', () => {
    const columns = QUEST_HEADER.split(',');
    expect(columns).toHaveLength(19);
    const sections = groupQuestColumns(columns);
    expect(sections.map((s) => [s.title, s.indexes.length])).toEqual([
      ['Identity', 5],
      ['Conditions', 4],
      ['Rewards', 3],
      ['Logistics', 7],
    ]);
    expect(sections.reduce((sum, s) => sum + s.indexes.length, 0)).toBe(19);
  });
});

describe('groupColumns — duplicate-name and empty-spec behaviour', () => {
  it('claims a duplicated column name once; the duplicate index lands in Other', () => {
    const sections = groupColumns(['A', 'B', 'A'], [{ title: 'S', columns: ['A', 'B'] }]);
    expect(sections).toEqual([
      { title: 'S', indexes: [0, 1] },
      { title: OTHER_SECTION_TITLE, indexes: [2] },
    ]);
  });
});

describe('applyRowEdit — table-level PUT reconstruction', () => {
  const rows = [
    ['A', 'one', 'x'],
    ['B', 'two', 'y'],
    ['C', 'three', 'z'],
  ];

  it('replaces exactly the target row; every other row is the same reference', () => {
    const out = applyRowEdit(rows, 1, ['B', 'two-edited', 'y']);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(rows[0]); // untouched rows pass through by reference
    expect(out[2]).toBe(rows[2]);
    expect(out[1]).toEqual(['B', 'two-edited', 'y']);
    expect(rows[1]).toEqual(['B', 'two', 'y']); // input not mutated
  });

  it('serializes with only the edited line differing', () => {
    const out = applyRowEdit(rows, 1, ['B', 'two-edited', 'y']);
    const before = rows.map((r) => r.join(','));
    const after = out.map((r) => r.join(','));
    const diffs = before.filter((line, i) => line !== after[i]);
    expect(diffs).toEqual(['B,two,y']); // exactly one line changed
  });

  it('throws on an out-of-range row index', () => {
    expect(() => applyRowEdit(rows, 3, ['D'])).toThrow(/out of range/);
  });
});

describe('reference resolution rules', () => {
  const keys = new Set(['1', '2', '23']);
  const labels = new Map([
    ['1', 'Builder'],
    ['23', 'Scout'],
  ]);

  it('splits multi values on the separator, dropping empty tokens', () => {
    expect(resolveReferenceTokens('1;23;', ';', keys, labels)).toEqual([
      { token: '1', resolved: true, label: 'Builder' },
      { token: '23', resolved: true, label: 'Scout' },
    ]);
  });

  it('marks unresolved tokens without inventing labels', () => {
    expect(resolveReferenceTokens('1;Machine-Controlled Zones', ';', keys, labels)).toEqual([
      { token: '1', resolved: true, label: 'Builder' },
      { token: 'Machine-Controlled Zones', resolved: false, label: null },
    ]);
  });

  it('treats a null separator as a single value and empty as no tokens', () => {
    expect(resolveReferenceTokens('23', null, keys)).toEqual([
      { token: '23', resolved: true, label: null },
    ]);
    expect(resolveReferenceTokens('', null, keys)).toEqual([]);
  });
});

describe('measurePickerViability — pickers only where the data resolves', () => {
  it('is viable at >=90% resolution across the whole table', () => {
    const rows = [
      ['n1', '1;2'],
      ['n2', '23'],
      ['n3', ''],
      ['n4', '2'],
    ];
    const v = measurePickerViability(rows, 1, ';', new Set(['1', '2', '23']));
    expect(v).toEqual({ viable: true, totalTokens: 4, resolvedTokens: 4, rate: 1 });
  });

  it('is NOT viable when the values do not resolve against the target (the BodyPoolRow case)', () => {
    const rows = [
      ['n1', 'SciFiMerc_Marauder_Full_01'],
      ['n2', 'SciFiMerc_Head_Hunter_Full_01'],
      ['n3', 'CS_F_NRW_Body'],
    ];
    const v = measurePickerViability(rows, 1, null, new Set(['CS_F_NRW_Body']));
    expect(v.viable).toBe(false);
    expect(v.resolvedTokens).toBe(1);
    expect(v.totalTokens).toBe(3);
  });

  it('an all-empty column is not viable (no evidence)', () => {
    const v = measurePickerViability([['a', ''], ['b', '']], 1, null, new Set(['x']));
    expect(v.viable).toBe(false);
    expect(v.totalTokens).toBe(0);
  });
});
