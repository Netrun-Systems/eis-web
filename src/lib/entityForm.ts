/**
 * WEB-011 — pure helpers for the entity-form surfaces (/people, /quests):
 * column→section grouping derived from the REAL headers, single-row edit
 * reconstruction against the table-level PUT contract, and the
 * reference-column resolution rules (which columns get pickers, and when).
 *
 * The groupings below were derived by reading Data/Core/NPCs.csv (83 columns)
 * and Data/Quest/Quests.csv (19 columns) on 2026-08-27 — every name is an
 * actual header. Anything a future header adds that these specs do not know
 * lands in an honest "Other" section rather than being forced somewhere.
 */

export interface SectionSpec {
  title: string;
  columns: string[];
}

export interface Section {
  title: string;
  /** Column indexes into the table's columns array, in table order. */
  indexes: number[];
}

export const OTHER_SECTION_TITLE = 'Other';

/**
 * Group a header into titled sections per a spec. Membership is by exact
 * column name; within a section, columns keep their spec order (the spec IS
 * the curated reading order). Unmatched columns land in "Other" in table
 * order. Every column appears exactly once — the section sizes always sum to
 * the header length.
 */
export function groupColumns(columns: string[], spec: SectionSpec[]): Section[] {
  const indexByName = new Map<string, number>();
  columns.forEach((c, i) => {
    if (!indexByName.has(c)) indexByName.set(c, i);
  });
  const claimed = new Set<number>();
  const sections: Section[] = [];
  for (const s of spec) {
    const indexes: number[] = [];
    for (const name of s.columns) {
      const i = indexByName.get(name);
      if (i !== undefined && !claimed.has(i)) {
        indexes.push(i);
        claimed.add(i);
      }
    }
    if (indexes.length > 0) sections.push({ title: s.title, indexes });
  }
  const other: number[] = [];
  columns.forEach((_, i) => {
    if (!claimed.has(i)) other.push(i);
  });
  if (other.length > 0) sections.push({ title: OTHER_SECTION_TITLE, indexes: other });
  return sections;
}

/** NPCs.csv — the 83 real columns, clustered by what the names actually say. */
export const NPC_SECTION_SPEC: SectionSpec[] = [
  { title: 'Identity', columns: ['NPC_ID', 'Name', 'Species', 'Age', 'Gender'] },
  {
    title: 'Appearance',
    columns: ['BodyType', 'HeadID', 'AppearanceProfile', 'BodyPoolRow'],
  },
  {
    title: 'Attributes',
    columns: [
      'Strength',
      'Dexterity',
      'Endurance',
      'Health',
      'Intelligence',
      'Wisdom',
      'Willpower',
      'Charisma',
    ],
  },
  {
    title: 'Personality traits',
    columns: [
      'Aggression',
      'Friendliness',
      'Curiosity',
      'Fearfulness',
      'Loyalty',
      'Independence',
      'Confidence',
      'Patience',
      'Honesty',
      'Empathy',
      'Resourcefulness',
      'Greed',
      'Generosity',
      'SurvivalInstinct',
    ],
  },
  {
    title: 'Needs',
    columns: ['Hunger', 'Thirst', 'Rest', 'SocialInteraction', 'Energy', 'Hygiene', 'Comfort'],
  },
  {
    title: 'Mind & memory',
    columns: [
      'MemoryDecayRate',
      'KnowledgeCapacity',
      'EmotionalState',
      'AwarenessLevel',
      'KnowledgeBase',
    ],
  },
  {
    title: 'World placement',
    columns: [
      'GroupAffiliations',
      'AssignedRoles',
      'HomeLocation',
      'WorkLocation',
      'HomeBiome',
      'KnownRisks',
      'NeedsHome',
      'NeedsWork',
      'NeedsRiskInfo',
    ],
  },
  {
    title: 'Social & dialogue',
    columns: ['DialogueOptions', 'Relationships', 'CulturalTraits'],
  },
  { title: 'Inventory & skills', columns: ['Inventory', 'Skills'] },
  {
    title: 'Talents & domains',
    columns: [
      'PrimaryDomain',
      'SecondaryDomain',
      'DomainSpecialization',
      'SignatureTraits',
      'BlindSpotTraits',
      'TalentProfile_Top5',
      'TalentProfile_Full',
      'InvestmentLevels',
      'SignatureTalent',
      'BlindSpotTalent',
      'ExecutingStrength',
      'InfluencingStrength',
      'RelationshipStrength',
      'StrategicStrength',
      'PersonalityRank',
      'TalentInvestment',
    ],
  },
  {
    title: 'Environment & survival',
    columns: [
      'EnvironmentalNeeds',
      'EnvironmentalContributions',
      'RadiationResistance',
      'HeatResistance',
      'CurrentRadiation',
      'CurrentHeatStress',
      'MutationLevel',
      'ActiveMutations',
      'WaterReserve',
      'EnvironmentPreferences',
    ],
  },
];

export const groupNpcColumns = (columns: string[]): Section[] =>
  groupColumns(columns, NPC_SECTION_SPEC);

/** Quests.csv — the 19 real columns. */
export const QUEST_SECTION_SPEC: SectionSpec[] = [
  {
    title: 'Identity',
    columns: ['QuestID', 'Faction', 'QuestName', 'QuestDescription', 'QuestType'],
  },
  {
    title: 'Conditions',
    columns: ['SuccessConditions', 'Requirements', 'Prerequisites', 'FailureConditions'],
  },
  { title: 'Rewards', columns: ['Rewards', 'ExperienceReward', 'GoldReward'] },
  {
    title: 'Logistics',
    columns: [
      'QuestGiver',
      'QuestLocation',
      'DifficultyLevel',
      'Status',
      'TimeLimit',
      'IsRepeatable',
      'CooldownTime',
    ],
  },
];

export const groupQuestColumns = (columns: string[]): Section[] =>
  groupColumns(columns, QUEST_SECTION_SPEC);

// ---------------------------------------------------------------------------
// Row → table reconstruction (the server contract is table-level).
// ---------------------------------------------------------------------------

/**
 * Rebuild the whole table with exactly one row replaced. Untouched rows are
 * passed through by reference, so their serialization is byte-identical —
 * the PUT carries the WHOLE table but only that row differs.
 */
export function applyRowEdit(rows: string[][], rowIndex: number, edited: string[]): string[][] {
  if (rowIndex < 0 || rowIndex >= rows.length) {
    throw new Error(`applyRowEdit: row index ${rowIndex} out of range (${rows.length} rows)`);
  }
  return rows.map((r, i) => (i === rowIndex ? [...edited] : r));
}

// ---------------------------------------------------------------------------
// Reference columns — pickers only where the target is unambiguous.
// ---------------------------------------------------------------------------

export interface ReferenceSpec {
  /** Column on the source table. */
  column: string;
  /** Repo-relative path of the referenced table. */
  targetPath: string;
  /** The referenced table's stem, for display. */
  targetLabel: string;
  /** The referenced table's display-name column (label beside the key). */
  labelColumn?: string;
  /** Multi-value separator (';' on the NPC columns), or null = single value. */
  separator: string | null;
  /** A deprecation note to surface on the field (HeadPool → WG-201). */
  deprecationNote?: string;
}

/** NPCs.csv reference columns whose target table is unambiguous from the
 * data. BodyPoolRow deliberately has NO spec: its values (SciFiMerc_*…) do
 * not resolve against BodyLibrary.BodyMeshID, so it stays plain text. */
export const NPC_REFERENCE_SPECS: ReferenceSpec[] = [
  {
    column: 'HeadID',
    targetPath: 'Data/Core/HeadPool.csv',
    targetLabel: 'HeadPool',
    labelColumn: 'DisplayName',
    separator: null,
    deprecationNote: 'deprecated pipeline (WG-201)',
  },
  {
    column: 'GroupAffiliations',
    targetPath: 'Data/Core/Groups_Definitions.csv',
    targetLabel: 'Groups_Definitions',
    labelColumn: 'GroupName',
    separator: ';',
  },
  {
    column: 'AssignedRoles',
    targetPath: 'Data/Core/Roles.csv',
    targetLabel: 'Roles',
    labelColumn: 'RoleName',
    separator: ';',
  },
];

export interface ResolvedToken {
  token: string;
  resolved: boolean;
  /** Display label from the target's label column, when the token resolves. */
  label: string | null;
}

/** Split a cell per the spec's separator and resolve each token against the
 * target's key set. Empty tokens are dropped (a trailing ';' is not a value). */
export function resolveReferenceTokens(
  value: string,
  separator: string | null,
  keys: ReadonlySet<string>,
  labels?: ReadonlyMap<string, string>,
): ResolvedToken[] {
  const tokens =
    separator === null ? (value === '' ? [] : [value]) : value.split(separator).filter((t) => t !== '');
  return tokens.map((token) => ({
    token,
    resolved: keys.has(token),
    label: labels?.get(token) ?? null,
  }));
}

/** The picker-viability threshold: a picker is offered only when ≥90% of the
 * non-empty tokens the table actually carries resolve against the target's
 * keys. Below that the reference target is NOT unambiguous from the data —
 * the field stays plain text (charter: a wrong link is worse than no link). */
export const PICKER_VIABILITY_THRESHOLD = 0.9;

export interface PickerViability {
  viable: boolean;
  totalTokens: number;
  resolvedTokens: number;
  rate: number;
}

/** Measure, over EVERY row of the source table, what share of this column's
 * tokens resolve. The decision is data-driven, not asserted. */
export function measurePickerViability(
  rows: readonly string[][],
  columnIndex: number,
  separator: string | null,
  keys: ReadonlySet<string>,
): PickerViability {
  let total = 0;
  let resolved = 0;
  for (const row of rows) {
    const value = row[columnIndex] ?? '';
    if (value === '') continue;
    const tokens = separator === null ? [value] : value.split(separator).filter((t) => t !== '');
    for (const t of tokens) {
      total++;
      if (keys.has(t)) resolved++;
    }
  }
  const rate = total === 0 ? 0 : resolved / total;
  return { viable: total > 0 && rate >= PICKER_VIABILITY_THRESHOLD, totalTokens: total, resolvedTokens: resolved, rate };
}
