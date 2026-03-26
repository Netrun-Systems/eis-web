import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulationStore } from '../../hooks/useSimulation';
import { createPlayerCharacter, type PlayerCreationOptions } from '../../engine/player';
import type { NPCAttributes, PersonalityTraits } from '../../engine/types';

const ATTRIBUTE_NAMES: (keyof NPCAttributes)[] = [
  'strength', 'dexterity', 'endurance', 'health', 'intelligence', 'wisdom', 'willpower', 'charisma',
];

const PERSONALITY_NAMES: (keyof PersonalityTraits)[] = [
  'aggression', 'friendliness', 'curiosity', 'fearfulness', 'loyalty',
  'independence', 'confidence', 'patience', 'honesty', 'empathy',
  'resourcefulness', 'greed', 'generosity', 'survivalInstinct',
];

const TALENTS = [
  { id: 'T001', name: 'Achiever' },
  { id: 'T002', name: 'Analytical' },
  { id: 'T003', name: 'Arranger' },
  { id: 'T005', name: 'Belief' },
  { id: 'T008', name: 'Deliberative' },
  { id: 'T009', name: 'Discipline' },
  { id: 'T010', name: 'Futuristic' },
  { id: 'T013', name: 'Ideation' },
  { id: 'T016', name: 'Learner' },
  { id: 'T017', name: 'Strategic' },
  { id: 'T019', name: 'Command' },
  { id: 'T021', name: 'Communication' },
  { id: 'T023', name: 'Activator' },
  { id: 'T025', name: 'Context' },
  { id: 'T028', name: 'Connectedness' },
  { id: 'T029', name: 'Empathy' },
  { id: 'T031', name: 'Input' },
  { id: 'T033', name: 'Positivity' },
  { id: 'T034', name: 'Relator' },
];

const FACTIONS = [
  { id: '5', name: 'Raiders' },
  { id: '7', name: 'Remnant Enclave' },
  { id: '2', name: 'Machines' },
  { id: '11', name: 'Forest Dwellers' },
  { id: '12', name: 'Nomads' },
  { id: '', name: 'Independent (no faction)' },
];

const STARTING_LOCATIONS = [
  { name: 'Remnant Enclave', x: 150, y: 350 },
  { name: 'Raider Encampment', x: 400, y: 100 },
  { name: 'Forest Edge', x: 100, y: 100 },
  { name: 'Desert Outpost', x: 500, y: 400 },
  { name: 'World Center', x: 300, y: 300 },
];

function AttributeSlider({
  name, value, onChange, pointsLeft,
}: {
  name: string;
  value: number;
  onChange: (val: number) => void;
  pointsLeft: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-eis-text-secondary w-24 capitalize">{name}</span>
      <button
        className="w-5 h-5 bg-eis-bg rounded text-xs text-eis-text-muted hover:bg-eis-bg-hover disabled:opacity-30"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
      >
        -
      </button>
      <div className="flex-1 h-3 bg-eis-bg rounded-full overflow-hidden">
        <div className="h-full bg-cyan-500/60" style={{ width: `${(value / 10) * 100}%` }} />
      </div>
      <span className="text-xs text-eis-text w-4 text-center">{value}</span>
      <button
        className="w-5 h-5 bg-eis-bg rounded text-xs text-eis-text-muted hover:bg-eis-bg-hover disabled:opacity-30"
        onClick={() => onChange(Math.min(10, value + 1))}
        disabled={value >= 10 || pointsLeft <= 0}
      >
        +
      </button>
    </div>
  );
}

export function CharacterCreation() {
  const { world } = useSimulationStore();
  const navigate = useNavigate();

  const [name, setName] = useState('Scout');
  const [attributes, setAttributes] = useState<NPCAttributes>({
    strength: 5, dexterity: 5, endurance: 5, health: 60,
    intelligence: 5, wisdom: 5, willpower: 5, charisma: 5,
  });
  const [personality, setPersonality] = useState<PersonalityTraits>({
    aggression: 4, friendliness: 6, curiosity: 7, fearfulness: 3,
    loyalty: 5, independence: 6, confidence: 6, patience: 5,
    honesty: 6, empathy: 5, resourcefulness: 7, greed: 3,
    generosity: 5, survivalInstinct: 6,
  });
  const [selectedTalents, setSelectedTalents] = useState<string[]>(['T001', 'T009', 'T023']);
  const [faction, setFaction] = useState('7');
  const [startLocation, setStartLocation] = useState(0);

  // Points calculations (30 attribute points, health starts at 60)
  const totalAttrPoints = 30;
  const usedAttrPoints = Object.entries(attributes)
    .filter(([k]) => k !== 'health')
    .reduce((sum, [, v]) => sum + v, 0);
  const attrPointsLeft = totalAttrPoints - usedAttrPoints;

  const setAttr = useCallback((key: keyof NPCAttributes, val: number) => {
    setAttributes(prev => ({ ...prev, [key]: val }));
  }, []);

  const setTrait = useCallback((key: keyof PersonalityTraits, val: number) => {
    setPersonality(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleTalent = useCallback((id: string) => {
    setSelectedTalents(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }, []);

  const handleCreate = useCallback(() => {
    if (!world) return;

    const loc = STARTING_LOCATIONS[startLocation];
    const opts: PlayerCreationOptions = {
      name,
      attributes: { ...attributes, health: 60 + attributes.endurance * 2 },
      personality,
      topTalents: selectedTalents,
      faction: faction || undefined,
      startPosition: { x: loc.x, y: loc.y },
      role: 'Scout',
    };

    const player = createPlayerCharacter(opts);
    world.npcs.push(player);
    world.playerId = player.id;

    navigate('/play');
  }, [world, name, attributes, personality, selectedTalents, faction, startLocation, navigate]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-eis-text">Create Your Character</h2>

      {/* Name */}
      <div className="eis-card">
        <label className="text-sm text-eis-text-secondary mb-1 block">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-eis-bg border border-eis-border rounded px-3 py-2 text-eis-text w-full"
          placeholder="Character name"
        />
      </div>

      {/* Attributes */}
      <div className="eis-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-eis-text-secondary uppercase">Attributes</h3>
          <span className={`text-xs ${attrPointsLeft > 0 ? 'text-cyan-400' : 'text-eis-text-muted'}`}>
            {attrPointsLeft} points remaining
          </span>
        </div>
        <div className="space-y-2">
          {ATTRIBUTE_NAMES.filter(k => k !== 'health').map(attr => (
            <AttributeSlider
              key={attr}
              name={attr}
              value={attributes[attr]}
              onChange={val => setAttr(attr, val)}
              pointsLeft={attrPointsLeft}
            />
          ))}
        </div>
        <div className="mt-2 text-xs text-eis-text-muted">
          Health: {60 + attributes.endurance * 2} (base 60 + Endurance x 2)
        </div>
      </div>

      {/* Personality */}
      <div className="eis-card">
        <h3 className="text-sm font-semibold text-eis-text-secondary uppercase mb-2">
          Personality Traits
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {PERSONALITY_NAMES.map(trait => (
            <div key={trait} className="flex items-center gap-2">
              <span className="text-xs text-eis-text-secondary w-28 capitalize">
                {trait.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <input
                type="range"
                min={0}
                max={10}
                value={personality[trait]}
                onChange={e => setTrait(trait, parseInt(e.target.value))}
                className="flex-1 h-1 accent-cyan-500"
              />
              <span className="text-xs text-eis-text w-4 text-right">{personality[trait]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Talents */}
      <div className="eis-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-eis-text-secondary uppercase">
            Top Talents (pick up to 5)
          </h3>
          <span className="text-xs text-eis-text-muted">{selectedTalents.length}/5 selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TALENTS.map(talent => {
            const isSelected = selectedTalents.includes(talent.id);
            return (
              <button
                key={talent.id}
                className={`px-2 py-1 rounded text-xs border ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400'
                    : 'border-eis-border bg-eis-bg text-eis-text-muted hover:border-eis-text-muted'
                }`}
                onClick={() => toggleTalent(talent.id)}
                disabled={!isSelected && selectedTalents.length >= 5}
              >
                {talent.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Faction & Location */}
      <div className="grid grid-cols-2 gap-4">
        <div className="eis-card">
          <h3 className="text-sm font-semibold text-eis-text-secondary uppercase mb-2">Faction</h3>
          <div className="space-y-1">
            {FACTIONS.map(f => (
              <label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="faction"
                  value={f.id}
                  checked={faction === f.id}
                  onChange={() => setFaction(f.id)}
                  className="accent-cyan-500"
                />
                <span className="text-eis-text-secondary">{f.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="eis-card">
          <h3 className="text-sm font-semibold text-eis-text-secondary uppercase mb-2">Starting Location</h3>
          <div className="space-y-1">
            {STARTING_LOCATIONS.map((loc, i) => (
              <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="location"
                  value={i}
                  checked={startLocation === i}
                  onChange={() => setStartLocation(i)}
                  className="accent-cyan-500"
                />
                <span className="text-eis-text-secondary">{loc.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Create button */}
      <button
        className="w-full py-3 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm disabled:opacity-50"
        onClick={handleCreate}
        disabled={!name.trim() || attrPointsLeft < 0 || selectedTalents.length === 0}
      >
        Enter the World as {name || '...'}
      </button>
    </div>
  );
}
