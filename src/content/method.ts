/**
 * WEB-014 — the methodology as typed content, in ONE reviewable file.
 *
 * Every string in this module is curated from the canonical philosophy
 * document: `Documentation/world-development philosophy.md` in the EISCORE
 * repo — "Procedural Spatial Infrastructure", **v2.0 (2026-08-16)**. Section
 * cites (`§N`) refer to that document's numbering; anchors point into the
 * in-app reader at /philosophy (see headingAnchor in ui/markdown/Markdown.tsx
 * for the anchor scheme: `§3` → `#s3`, `§17.4` → `#s17-4`, Part VIII →
 * `#part-viii`).
 *
 * Curated sections: §1–§3 (the method, vocabulary/instance, dependency
 * chain), §7–§14 (the eight authored tables), §15 (group tokens), §17.4
 * (join checks), §18.6 (generated files), §19 (Step 0), §20 (authoring
 * order + stop-when criteria), §21–§22 (the brief and the coverage check),
 * §29.1–§29.2 (registration, distribution), §33 (hard/soft), §36 (designer
 * verbs), §38 (the production loop), §45 (portability checklist),
 * Part VIII (the twelve silent failure modes).
 *
 * Rule for editing this file: never write a methodology claim the document
 * does not make. Quotes marked `quote:` are verbatim from the doc.
 */

export const PHILOSOPHY_ROUTE = '/philosophy';
export const PHILOSOPHY_DOC_PATH = 'Documentation/world-development philosophy.md';
export const PHILOSOPHY_DOC_VERSION = 'v2.0 — 2026-08-16';

export interface Cite {
  /** Display label, e.g. "§21" or "Part VIII". */
  label: string;
  /** Anchor id inside /philosophy, e.g. "s21". */
  anchor: string;
}

export const cite = (label: string, anchor: string): Cite => ({ label, anchor });

// ---------------------------------------------------------------------------
// The workflow spine — §3's dependency chain as authorable stages.
// ---------------------------------------------------------------------------

export interface MethodStage {
  /** Stable id; for vocabulary stages this is the normalized world-gen stem. */
  id: string;
  /** Normalized table stem in Data/WorldGen (undefined for Brief/Generate). */
  stem?: string;
  title: string;
  /** Where "Author →" goes. */
  route: string;
  /** 1–3 sentences distilled from the doc — the stage's role in the method. */
  role: string;
  cites: Cite[];
  /** §20's "Stop when" criterion for this step, near-verbatim. */
  stopWhen?: string;
  /** What this stage depends on (upstream), from §3's ordering rationale. */
  dependsOn: string;
  /** What depends on this stage (downstream). */
  enables: string;
  /** Optional verbatim warning/quote from the doc, shown in quote styling. */
  quote?: { text: string; cite: Cite };
}

/** The nine numbered stages: the eight authored vocabulary tables in §3
 * dependency order, then the Brief (§21). Generation is the unnumbered
 * terminus (GENERATE_STAGE below) — it happens in the Unreal editor. */
export const METHOD_STAGES: MethodStage[] = [
  {
    id: 'Regions',
    stem: 'Regions',
    title: 'Regions',
    route: '/vocabulary/Regions',
    role:
      'What kind of place is this — kinds of place, not places. The region record is the ' +
      'environment-art brief: it tells the team "build things that satisfy these needs", which ' +
      'is far more actionable than "make some cool ruined buildings".',
    cites: [cite('§7', 's7'), cite('§19', 's19')],
    stopWhen: 'every region has a biome that exists downstream (§20 step 1)',
    dependsOn: 'World intent — nothing upstream but Step 0 (§19): name your axes first.',
    enables:
      'Every downstream table points back here through RegionAffinity; the AllUrban/AllSettled ' +
      'group tokens are derived from region columns (§15).',
    quote: {
      text:
        '`StructureFamilies` is a second vocabulary and it has already diverged. … For a new ' +
        'world, pick one vocabulary and use it in both columns.',
      cite: cite('§7', 's7'),
    },
  },
  {
    id: 'InfrastructureNetworks',
    stem: 'InfrastructureNetworks',
    title: 'Infrastructure Networks',
    route: '/vocabulary/InfrastructureNetworks',
    role:
      'What systems run through the world. Infrastructure before structure is not arbitrary: ' +
      'roads, sewers and rail decide where buildings can go and what they can connect to; ' +
      'generating buildings first produces networks that touch nothing (§3).',
    cites: [cite('§8', 's8'), cite('§3', 's3'), cite('§17.4', 's17-4')],
    stopWhen: 'every network has a building connection that will exist (§20 step 2)',
    dependsOn: 'Regions — RegionAffinity says where each network exists.',
    enables:
      'BuildingConnectionType is the join to structures and spaces — the layer join §17.4 checks.',
    quote: {
      text:
        'The one this project got wrong. … 10 of 13 networks declared a `BuildingConnectionType` ' +
        'that no structure’s `PreferredConnections` named, and none of the 13 were named by any ' +
        'space’s `AllowedConnectionTypes`. Every reference resolved, so foreign-key validation ' +
        'was clean. The sewers simply had no lawful way into a building.',
      cite: cite('§3', 's3'),
    },
  },
  {
    id: 'StructureTypes',
    stem: 'StructureTypes',
    title: 'Structure Types',
    route: '/vocabulary/StructureTypes',
    role:
      'What kinds of structure exist here. Each row carries a family (what kind of thing it is) ' +
      'and a generator mode (which grammar owns its volume) — separate axes, both on the ' +
      'structure type (§5). RequiredSpaceTypes is the structure’s own definition of what makes ' +
      'it that structure.',
    cites: [cite('§9', 's9'), cite('§5', 's5')],
    stopWhen: 'every structure has a generator mode and a region (§20 step 3)',
    dependsOn: 'Regions and Networks — where structures may exist, what they must connect to.',
    enables:
      'Circulation is derived from Primary/SecondaryCirculation here (§10 ⚠️); Space and ' +
      'Connection rows are authored to satisfy the lists this table declares.',
    quote: {
      text:
        'An office tower without a lobby, stair core and utility space is not an office tower, ' +
        'and the compiler says so by name.',
      cite: cite('§9', 's9'),
    },
  },
  {
    id: 'SpaceTypes',
    stem: 'SpaceTypes',
    title: 'Space Types',
    route: '/vocabulary/SpaceTypes',
    role:
      'What spaces exist inside structures — semantic volumes, not meshes; the largest table and ' +
      'the one that grows fastest. Adjacency is authored here: PrimaryAdjacency is "wants to be ' +
      'next to", AvoidAdjacency is a soft rule — a warning, not an error.',
    cites: [cite('§10', 's10')],
    stopWhen: 'every RequiredSpaceTypes entry exists (§20 step 4)',
    dependsOn: 'Structure Types — their Required/Preferred lists are the rows to write.',
    enables:
      'The decoration system queries the space type; AllowedConnectionTypes points at the next stage.',
    quote: {
      text:
        '`Category` does not identify circulation. … Any rule that needs to know "is this ' +
        'circulation?" must derive the set from `PrimaryCirculation`/`SecondaryCirculation` on ' +
        'the structure types instead.',
      cite: cite('§10', 's10'),
    },
  },
  {
    id: 'ConnectionTypes',
    stem: 'ConnectionTypes',
    title: 'Connection Types',
    route: '/vocabulary/ConnectionTypes',
    role:
      'How spaces may connect. TraversalAxis is load-bearing: a Vertical connection whose ends ' +
      'are on one floor is a stair that connects nothing; a Horizontal one spanning floors is a ' +
      'door into thin air — both compile errors (§25). Only OneWayAllowed connections may carry ' +
      'a one-way edge.',
    cites: [cite('§11', 's11'), cite('§25', 's25')],
    stopWhen: 'every AllowedConnectionTypes entry exists (§20 step 5)',
    dependsOn: 'Spaces and Networks — both name connection rows that must exist here.',
    enables:
      'Asset contracts: if the table says stairs are 20–40° and support AI traversal, the stair ' +
      'asset must satisfy all of it — the table is the contract (§28.5).',
    quote: {
      text:
        '`ValidFrom/ValidToCategories` is a third vocabulary. Of 35 distinct tokens in Exodus, ' +
        'only 9 are `SpaceTypes.Category` values. … Do not let it grow by accident.',
      cite: cite('§11', 's11'),
    },
  },
  {
    id: 'AssetRegistry',
    stem: 'AssetRegistry',
    title: 'Asset Registry',
    route: '/vocabulary/AssetRegistry',
    role:
      'What physical pieces may be placed — the governance layer: an unregistered asset does not ' +
      'exist as far as generation is concerned. Registration is the moment an asset exists ' +
      '(§29.1), and the registry’s recorded dimensions must agree with the mesh (§28).',
    cites: [cite('§13', 's13'), cite('§29.1', 's29-1'), cite('§28', 's28')],
    stopWhen: 'filled by the art pipeline, not up front (§20 step 8)',
    dependsOn: 'Everything above — rows bind to structures, regions, states and connections.',
    enables: 'The generator resolves meshes only through registered, contracted pieces.',
    quote: {
      text: 'artist creates mesh → technical validation → registry entry → generator can use it',
      cite: cite('§29.1', 's29-1'),
    },
  },
  {
    id: 'AssetStates',
    stem: 'AssetStates',
    title: 'Asset States',
    route: '/vocabulary/AssetStates',
    role:
      'What condition a piece can be in. State is an axis, not a variant pool: do not build ' +
      'seven bespoke structures — build one and transform it (§30). The decay chain must be ' +
      'closed under AllowedMutations.',
    cites: [cite('§12', 's12'), cite('§30', 's30')],
    stopWhen: 'the chain is closed under AllowedMutations (§20 step 6)',
    dependsOn: 'The registry — DefaultState/AllowedStates bind pieces onto the chain.',
    enables: 'One vocabulary yields original, abandoned, damaged and reoccupied variants of the same content (§1.3).',
    quote: {
      text:
        'Do not let state variants leak into random selection — an `_Abandoned` mesh in the ' +
        'general pool means pristine buildings sprout ruined walls by chance.',
      cite: cite('§12', 's12'),
    },
  },
  {
    id: 'GenerationRules',
    stem: 'GenerationRules',
    title: 'Generation Rules',
    route: '/vocabulary/GenerationRules',
    role:
      'What makes a generated result valid — design constraints, not implementation details. ' +
      'Hard rule: failure means regenerate. Soft rule: failure means a score penalty. That ' +
      'split is what lets generation produce believable imperfection (§33).',
    cites: [cite('§14', 's14'), cite('§33', 's33')],
    stopWhen: 'every structure has ≥1 hard constraint (§20 step 7)',
    dependsOn: 'Every table above — a rule targets a Region, Structure, Space, Connection or Network row.',
    enables: 'Candidate generation: generate N, validate, score, rank, keep the best (§33).',
    quote: {
      text:
        'Check that your rules actually cover your structures. … zero `HardConstraint` entries ' +
        'means nothing defines what a valid result looks like there — generation will run ' +
        'unconstrained and produce something plausible-looking that no rule ever approved.',
      cite: cite('§14', 's14'),
    },
  },
  {
    id: 'Brief',
    title: 'Location Brief',
    route: '/briefs',
    role:
      'Design locations against the vocabulary. A brief is a query against the metadata: "Do we ' +
      'already possess enough assets and generation rules to produce this location?" If yes, ' +
      'generate. If no, the missing pieces are the environment-art backlog.',
    cites: [cite('§21', 's21'), cite('§22', 's22')],
    dependsOn: 'The whole vocabulary — the brief is graded against it.',
    enables: 'The production loop (§38): gap analysis → art backlog → build → register → generate.',
    quote: {
      text: 'The level designer’s first artifact is not a level. It is a brief.',
      cite: cite('§21', 's21'),
    },
  },
];

/** The unnumbered terminus. Honest about the tool boundary: generation runs
 * in the Unreal editor via PCG — EISWeb's job ends at validated metadata and
 * a BUILDABLE brief. */
export const GENERATE_STAGE = {
  id: 'Generate',
  title: 'Generate',
  role:
    'Generation runs in the Unreal editor via PCG — steps 6–9 of the production loop (generate ' +
    'candidate seeds → validate → playtest → refine metadata, §38). This tool’s job ends at ' +
    'validated metadata and a brief that grades BUILDABLE; the loop then returns here to refine ' +
    'rules and weights.',
  cites: [cite('§38', 's38'), cite('§33', 's33')],
  /** §36 — procedural does not mean procedural-only. */
  designerVerbs: ['LOCK', 'EXCLUDE', 'FORCE', 'RESEED', 'OVERRIDE', 'PROMOTE', 'PIN'],
  designerVerbsCite: cite('§36', 's36'),
} as const;

/** §20, verbatim — shown at every validate-between-stages affordance. */
export const VALIDATE_BETWEEN_QUOTE = {
  text:
    'At each step, stop and validate before moving on — an unresolved reference is cheap now ' +
    'and expensive after three more tables depend on it.',
  cite: cite('§20', 's20'),
};

export const stageIndexById = (id: string): number => METHOD_STAGES.findIndex((s) => s.id === id);
export const stageByStem = (stem: string): MethodStage | undefined =>
  METHOD_STAGES.find((s) => s.stem === stem);

// ---------------------------------------------------------------------------
// §45 — the portability checklist (workflow page footer).
// ---------------------------------------------------------------------------

export const PORTABILITY_CHECKLIST: { text: string }[] = [
  { text: 'Every table has rows; none is empty "for now"' },
  { text: 'Reference health reads 0 unresolved' },
  { text: 'Every set-valued token has a derivation rule, not a typed member list' },
  { text: 'Every network has a building connection that some structure or space names' },
  { text: 'Every structure type has ≥1 hard constraint targeting it' },
  { text: 'Every structure type has ≥1 registered asset' },
  { text: 'Every required space type is reachable through some connection type' },
  { text: 'The state chain is closed under its allowed mutations' },
  { text: 'Piece-type coverage is measured against the vocabulary the generator resolves through' },
  { text: 'Coverage reports distribution, not just count' },
  { text: 'One brief has been written and passes with 0 blockers' },
  { text: 'One space graph compiles with 0 errors' },
  { text: 'The axes in §19 are written down somewhere, once' },
];
export const PORTABILITY_CITE = cite('§45', 's45');

// ---------------------------------------------------------------------------
// MethodContext panels — what each surface is FOR, in the method's own words.
// ---------------------------------------------------------------------------

export type SurfaceKey =
  | 'vocabulary-root'
  | 'vocabulary:Regions'
  | 'vocabulary:InfrastructureNetworks'
  | 'vocabulary:StructureTypes'
  | 'vocabulary:SpaceTypes'
  | 'vocabulary:ConnectionTypes'
  | 'vocabulary:AssetRegistry'
  | 'vocabulary:AssetStates'
  | 'vocabulary:GenerationRules'
  | 'briefs'
  | 'tables'
  | 'validation'
  | 'world-canvas';

export interface SurfaceContext {
  title: string;
  /** What this surface is in the method — 1–3 sentences. */
  lead: string;
  /** The doc's normative rules for this surface, each with its cite. */
  rules: { text: string; cite: Cite }[];
  /** Optional verbatim quote, rendered in quote styling. */
  quote?: { text: string; cite: Cite };
  /** "Read more" — §-cited links into /philosophy. */
  readMore: Cite[];
}

const vocabStageContext = (stage: MethodStage, extraRules: { text: string; cite: Cite }[]): SurfaceContext => ({
  title: `${stage.title} in the method`,
  lead: stage.role,
  rules: [
    ...(stage.stopWhen !== undefined
      ? [{ text: `Stop when: ${stage.stopWhen}. Run the validator before moving on.`, cite: cite('§20', 's20') }]
      : []),
    ...extraRules,
  ],
  quote: stage.quote,
  readMore: stage.cites,
});

export const METHOD_CONTEXT: Record<SurfaceKey, SurfaceContext> = {
  'vocabulary-root': {
    title: 'Step 0 — name your axes before filling any table',
    lead:
      'These eight tables are the authored vocabulary: what kinds of thing can exist and what ' +
      'makes a result valid (§2). Before authoring a single row, answer §19’s questions once ' +
      'and write them down: your regions (kinds of place, not places), structure families, ' +
      'space categories, state chain, networks and how each enters a building, unit and grid, ' +
      'and strata. Most of the schema damage in Part II’s warnings comes from axes that were ' +
      'never named and therefore grew twice.',
    rules: [
      {
        text:
          'Cautionary list — the four places this schema grew two vocabularies for one concept: ' +
          '(1) Regions.StructureFamilies holds 57 building-type nouns while StructureTypes.Family ' +
          'holds 14 architectural categories — neither is a superset (§7); ' +
          '(2) ConnectionTypes.ValidFrom/ValidToCategories — only 9 of its 35 tokens are real ' +
          'SpaceTypes.Category values (§11); ' +
          '(3) AssetRegistry.StructuralRole is prose, 42 near-unique values across 63 rows — it ' +
          'cannot carry a coverage check (§13); ' +
          '(4) AssetRegistry.TraversalType mixes CON_ rows with movement modes — the one ' +
          'deliberate, documented exception (§13).',
        cite: cite('Part VIII #6', 'part-viii'),
      },
      {
        text:
          'Author in §3’s dependency order — each layer constrains the next, and authoring out ' +
          'of order produces tables that reference rows nobody has written.',
        cite: cite('§3', 's3'),
      },
    ],
    quote: {
      text:
        'Every ⚠️ in Part II is a case of one of these questions being answered twice, ' +
        'differently, months apart.',
      cite: cite('§19', 's19'),
    },
    readMore: [cite('§19', 's19'), cite('§2', 's2'), cite('§3', 's3')],
  },

  'vocabulary:Regions': vocabStageContext(METHOD_STAGES[0], [
    {
      text:
        'LandmarkTags is worth more than it looks: a named location matching a landmark tag is a ' +
        'hero location, and the workflow for those is different (§37).',
      cite: cite('§7', 's7'),
    },
  ]),

  'vocabulary:InfrastructureNetworks': vocabStageContext(METHOD_STAGES[1], [
    {
      text:
        'Normative: BuildingConnectionType must name at least one connection that appears in some ' +
        'structure’s PreferredConnections or some space’s AllowedConnectionTypes — otherwise ' +
        'the network generates in the ground with no lawful way into a building. Invisible to ' +
        'foreign-key validation; a reachability check, not a reference check.',
      cite: cite('§8', 's8'),
    },
  ]),

  'vocabulary:StructureTypes': vocabStageContext(METHOD_STAGES[2], [
    {
      text:
        'Choose the generator mode from how the space is actually organised, not from what looks ' +
        'easiest — a hotel generated PartitionFirst produces rooms with no shared corridor and ' +
        'then has to retrofit one.',
      cite: cite('§5', 's5'),
    },
  ]),

  'vocabulary:SpaceTypes': vocabStageContext(METHOD_STAGES[3], [
    {
      text:
        'Adjacency semantics: PrimaryAdjacency ("wants to be next to") and AvoidAdjacency may ' +
        'name a SpaceType row or a Category — a declared, bounded exception. AvoidAdjacency is a ' +
        'soft rule: a warning, not an error.',
      cite: cite('§10', 's10'),
    },
  ]),

  'vocabulary:ConnectionTypes': vocabStageContext(METHOD_STAGES[4], [
    {
      text:
        'Category tokens: the from/to gate is advisory — it fires only when every token on that ' +
        'side is a known Category, because 26 of 35 Exodus tokens belong to an uncodified fourth ' +
        'axis. Use Category values here, or declare the second axis as a real column.',
      cite: cite('§11', 's11'),
    },
  ]),

  'vocabulary:AssetRegistry': vocabStageContext(METHOD_STAGES[5], [
    {
      text:
        'Coverage must be measured against the piece-type vocabulary the generator actually ' +
        'resolves through (§29), not against the StructuralRole column — and read the ' +
        'distribution, not the count: 906 walls in three urban styles with every stair from one ' +
        'rural village import reads "fine" and generates absurdity (§29.2).',
      cite: cite('§29.2', 's29-2'),
    },
  ]),

  'vocabulary:AssetStates': vocabStageContext(METHOD_STAGES[6], [
    {
      text:
        'States are transformations, not new meshes: base piece + material variation + damage ' +
        'overlay + decal + attachment + clutter. One piece generates dozens of appearances; five ' +
        'bespoke wall meshes generate five (§30).',
      cite: cite('§30', 's30'),
    },
  ]),

  'vocabulary:GenerationRules': vocabStageContext(METHOD_STAGES[7], [
    {
      text:
        'HardConstraint decides the failure mode: hard = regenerate; soft = score penalty. Real ' +
        'buildings are not optimal; they are possible — the split is what lets generation produce ' +
        'believable imperfection.',
      cite: cite('§33', 's33'),
    },
  ]),

  briefs: {
    title: 'The brief comes before the editor',
    lead:
      'Plain text, written before opening the editor: a brief is a query against the metadata — ' +
      '"Do we already possess enough assets and generation rules to produce this location?" A ' +
      'NOT BUILDABLE verdict is still a legitimate artifact: its gap list is directly the ' +
      'environment-art backlog, which beats creating arbitrary assets and hoping they become ' +
      'useful (§21).',
    rules: [
      {
        text:
          'Report every name resolution — designer language ("Office Towers") must resolve to ' +
          'row names (STR_OfficeTower), and a silent fuzzy match is how a brief ends up ' +
          'describing a place nobody meant.',
        cite: cite('§22', 's22'),
      },
      {
        text:
          'State why each piece is required — the step from "enclosed interior" to "therefore ' +
          'floor, wall and ceiling pieces" is not in any table; the reason is attached to each ' +
          'requirement so a wrong assumption is visible rather than buried in a generator.',
        cite: cite('§22', 's22'),
      },
      {
        text:
          'Read the distribution, not the count — a piece type with plenty of entries can still ' +
          'be unusable when they are all in the wrong style, region or state (§29.2).',
        cite: cite('§22', 's22'),
      },
    ],
    quote: {
      text: 'The level designer’s first artifact is not a level. It is a brief.',
      cite: cite('§21', 's21'),
    },
    readMore: [cite('§21', 's21'), cite('§22', 's22'), cite('§38', 's38')],
  },

  tables: {
    title: 'Vocabulary versus instance data',
    lead:
      'This browser shows the whole CSV corpus, but the method splits it in two: vocabulary ' +
      'answers "what kinds of thing can exist" and is authored rarely and deliberately with a ' +
      'schema-driven form; instance data answers "what exists here" and is edited constantly ' +
      'with a canvas. Conflating them is the characteristic failure (§2).',
    rules: [
      {
        text:
          'Generated tables are never edited directly — output directories are generated from ' +
          'authoring sources, and editing the output means your edit disappears at the next run. ' +
          'That is why generated tables here are read-only: author through the Vocabulary editor ' +
          'instead.',
        cite: cite('§18.6', 's18-6'),
      },
      {
        text:
          'Column 0 is the row key and must be unique — a repeated value means later rows ' +
          'silently overwrite earlier ones. This cost the project 697 rows across 11 tables ' +
          'before anyone noticed.',
        cite: cite('§18', 's18'),
      },
    ],
    quote: {
      text:
        'The test: if adding a second location of the same kind requires editing the vocabulary, ' +
        'the split is wrong.',
      cite: cite('§2', 's2'),
    },
    readMore: [cite('§2', 's2'), cite('§18', 's18')],
  },

  validation: {
    title: 'Silence is the failure mode',
    lead:
      'Part VIII lists twelve ways this pipeline lies to you — each cost the project real time, ' +
      'and the pattern behind most of them is that the system’s failure mode is silence. This ' +
      'validator exists to convert silent defects into loud, specific, named findings.',
    rules: [
      { text: '1 · Non-unique row key — later rows silently overwrite earlier ones; a partly-populated table still generates (697 rows lost).', cite: cite('Part VIII', 'part-viii') },
      { text: '2 · Defaults that look like data — a failed write reads back its declared default, e.g. "Wall".', cite: cite('Part VIII', 'part-viii') },
      { text: '3 · Writes into nothing — an unallocated slot discards writes silently; verify by reading back.', cite: cite('Part VIII', 'part-viii') },
      { text: '4 · Sampling one row — defaults look like data; check the distribution, never a sample row.', cite: cite('Part VIII', 'part-viii') },
      { text: '5 · Perfect FK integrity, disconnected layers — every reference resolves and nothing connects (§17.4).', cite: cite('Part VIII', 'part-viii') },
      { text: '6 · Two vocabularies for one concept — grows silently until both are load-bearing; four instances in this schema.', cite: cite('Part VIII', 'part-viii') },
      { text: '7 · Coverage by count — hundreds of entries, all in the wrong style (§29.2).', cite: cite('Part VIII', 'part-viii') },
      { text: '8 · Style fallback masking absence — a wrong-styled piece still connects two floors, so nothing errors.', cite: cite('Part VIII', 'part-viii') },
      { text: '9 · A validator that over-reports — 95% false positives stops being read, worse than not checking.', cite: cite('Part VIII', 'part-viii') },
      { text: '10 · A validator that under-reports on partial load — a half-loaded vocabulary must report a good graph as good.', cite: cite('Part VIII', 'part-viii') },
      { text: '11 · Guessed classification — a wrong piece type is worse than a missing one; the generator places it confidently.', cite: cite('Part VIII', 'part-viii') },
      { text: '12 · Editing generated output — the edit vanishes at the next run, usually during a demo.', cite: cite('Part VIII', 'part-viii') },
    ],
    quote: {
      text:
        'Design every check to produce a loud, specific, named failure — and prefer a check that ' +
        'says "`Ceiling`: 0 entries, required because this structure has an enclosed interior" ' +
        'over one that says "validation failed".',
      cite: cite('Part VIII', 'part-viii'),
    },
    readMore: [cite('Part VIII', 'part-viii'), cite('§17', 's17')],
  },

  'world-canvas': {
    title: 'The canvas edits instance data',
    lead:
      'This canvas edits what exists HERE — WorldLayout’s 64 grid cells are instance data, ' +
      'the level designer’s side of §2’s split, and per that table instance data is ' +
      '"edited with a canvas". The vocabulary tables author what KINDS of thing can exist ' +
      '(§2, §6) and are edited with schema-driven forms, not here.',
    rules: [
      {
        text:
          'WorldLayout is the one editable table on this surface. Regions and RegionCrosswalk ' +
          'are generated outputs of the world-gen pipeline — shown read-only in the inspector; ' +
          'edit the sources and re-run the generator.',
        cite: cite('§18.6', 's18-6'),
      },
      {
        text:
          'The crosswalk is declared, with reasons — the inspector shows each join’s MatchBasis, ' +
          'and an override row carries its stated reason instead of pretending the names match.',
        cite: cite('§16', 's16'),
      },
    ],
    quote: {
      text:
        'The test: if adding a second location of the same kind requires editing the vocabulary, ' +
        'the split is wrong.',
      cite: cite('§2', 's2'),
    },
    readMore: [cite('§2', 's2'), cite('§6', 's6'), cite('§16', 's16')],
  },
};

export const surfaceKeyForStem = (stem: string): SurfaceKey | null => {
  const key = `vocabulary:${stem}` as SurfaceKey;
  return key in METHOD_CONTEXT ? key : null;
};
