import React, { useState } from 'react';
import type { NPC } from '../../engine/types';
import { PERSONALITY_TRAIT_KEYS, NEED_KEYS } from '../../engine/types';

interface Props {
  npc: NPC;
}

export function NPCEditor({ npc }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="eis-btn-secondary text-sm">
        Open Editor
      </button>
    );
  }

  return (
    <div className="eis-card space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-eis-text">NPC Editor</h3>
        <button onClick={() => setIsOpen(false)} className="text-eis-text-muted hover:text-eis-text">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Attributes */}
      <div>
        <h4 className="text-sm font-medium text-eis-text-secondary mb-3">Attributes (0-10)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(npc.attributes).map(([key, val]) => (
            <div key={key}>
              <label className="text-xs text-eis-text-muted capitalize block mb-1">{key}</label>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={Number(val)}
                onChange={e => {
                  (npc.attributes as unknown as Record<string, number>)[key] = Number(e.target.value);
                }}
                className="w-full accent-eis-green"
              />
              <span className="text-xs text-eis-text font-mono">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Personality Traits */}
      <div>
        <h4 className="text-sm font-medium text-eis-text-secondary mb-3">Personality Traits (0-10)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {PERSONALITY_TRAIT_KEYS.map(key => (
            <div key={key}>
              <label className="text-xs text-eis-text-muted capitalize block mb-1">
                {key.replace(/([A-Z])/g, ' $1')}
              </label>
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={npc.personality[key]}
                onChange={e => {
                  npc.personality[key] = Number(e.target.value);
                }}
                className="w-full accent-eis-green"
              />
              <span className="text-xs text-eis-text font-mono">{npc.personality[key].toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Needs */}
      <div>
        <h4 className="text-sm font-medium text-eis-text-secondary mb-3">Needs (0-100)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {NEED_KEYS.map(key => (
            <div key={key}>
              <label className="text-xs text-eis-text-muted capitalize block mb-1">
                {key.replace(/([A-Z])/g, ' $1')}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={npc.needs[key]}
                onChange={e => {
                  npc.needs[key] = Number(e.target.value);
                }}
                className="w-full accent-eis-green"
              />
              <span className="text-xs text-eis-text font-mono">{Math.round(npc.needs[key])}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Behavior Prediction */}
      <div className="bg-eis-bg rounded-lg p-3">
        <h4 className="text-sm font-medium text-eis-text-secondary mb-2">Behavior Prediction</h4>
        <p className="text-sm text-eis-text">
          Given these traits, this NPC will prioritize:{' '}
          <span className="text-eis-green font-medium">
            {getBehaviorPrediction(npc)}
          </span>
        </p>
      </div>
    </div>
  );
}

function getBehaviorPrediction(npc: NPC): string {
  const predictions: string[] = [];
  const p = npc.personality;

  if (p.aggression >= 7) predictions.push('Combat/Defense');
  if (p.friendliness >= 7) predictions.push('Socializing');
  if (p.curiosity >= 7) predictions.push('Exploration');
  if (p.greed >= 7) predictions.push('Trading/Hoarding');
  if (p.generosity >= 7) predictions.push('Helping Others');
  if (p.fearfulness >= 7) predictions.push('Fleeing/Hiding');
  if (p.resourcefulness >= 7) predictions.push('Crafting/Problem-solving');
  if (p.survivalInstinct >= 7) predictions.push('Survival (Food/Water)');

  // Need-based predictions
  const highNeeds = NEED_KEYS.filter(k => npc.needs[k] >= 60);
  for (const need of highNeeds.slice(0, 2)) {
    predictions.push(`Address ${need.replace(/([A-Z])/g, ' $1')}`);
  }

  return predictions.length > 0 ? predictions.join(', ') : 'General activity (balanced profile)';
}
