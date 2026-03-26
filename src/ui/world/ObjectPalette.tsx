import React, { useState, useMemo } from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { OBJECT_CATALOG, getCategories } from '../../engine/object-catalog';
import { OBJECT_CATEGORY_LABELS } from '../../engine/world-map-types';
import type { ObjectType, ObjectCategory } from '../../engine/world-map-types';

export function ObjectPalette() {
  const { editor, setSelectedObjectType } = useWorldEditorStore();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  const categories = useMemo(() => getCategories(), []);

  const filteredObjects = useMemo(() => {
    const entries = Object.entries(OBJECT_CATALOG) as [ObjectType, (typeof OBJECT_CATALOG)[ObjectType]][];
    return entries.filter(([type, obj]) => {
      if (activeCategory !== 'all' && obj.category !== activeCategory) return false;
      if (search && !obj.name.toLowerCase().includes(search.toLowerCase()) && !type.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [activeCategory, search]);

  return (
    <div className="w-64 bg-eis-bg-card border border-eis-border rounded shadow-lg max-h-[500px] flex flex-col">
      <div className="p-2 border-b border-eis-border">
        <p className="text-xs font-medium text-eis-text mb-2">Object Palette</p>
        <input
          type="text"
          placeholder="Search objects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-eis-bg border border-eis-border rounded text-eis-text placeholder-eis-text-muted focus:border-eis-green focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-eis-border">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2 py-0.5 text-[10px] rounded ${
            activeCategory === 'all' ? 'bg-eis-green/20 text-eis-green' : 'text-eis-text-muted hover:text-eis-text'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2 py-0.5 text-[10px] rounded ${
              activeCategory === cat ? 'bg-eis-green/20 text-eis-green' : 'text-eis-text-muted hover:text-eis-text'
            }`}
          >
            {OBJECT_CATEGORY_LABELS[cat as ObjectCategory] ?? cat}
          </button>
        ))}
      </div>

      {/* Object grid */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-4 gap-1">
        {filteredObjects.map(([type, obj]) => (
          <button
            key={type}
            onClick={() => setSelectedObjectType(type)}
            className={`flex flex-col items-center justify-center p-1.5 rounded border transition-colors ${
              editor.selectedObjectType === type
                ? 'border-eis-green bg-eis-green/10'
                : 'border-transparent hover:bg-eis-bg-hover'
            }`}
            title={`${obj.name}${obj.satisfiesNeed ? ` (${obj.satisfiesNeed})` : ''}`}
          >
            <span className="text-lg leading-none">{obj.icon}</span>
            <span className="text-[8px] text-eis-text-secondary mt-0.5 truncate w-full text-center">
              {obj.name}
            </span>
          </button>
        ))}
      </div>

      {/* Selected object details */}
      {editor.selectedObjectType && (
        <SelectedObjectDetail type={editor.selectedObjectType} />
      )}
    </div>
  );
}

function SelectedObjectDetail({ type }: { type: ObjectType }) {
  const obj = OBJECT_CATALOG[type];
  if (!obj) return null;

  return (
    <div className="p-2 border-t border-eis-border">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{obj.icon}</span>
        <div>
          <p className="text-xs font-medium text-eis-text">{obj.name}</p>
          <p className="text-[10px] text-eis-text-muted">{OBJECT_CATEGORY_LABELS[obj.category] ?? obj.category}</p>
        </div>
      </div>
      {obj.satisfiesNeed && (
        <p className="text-[10px] text-eis-green">
          Satisfies: {obj.satisfiesNeed} (-{obj.needSatisfactionAmount})
        </p>
      )}
      <p className="text-[10px] text-eis-text-muted">
        Capacity: {obj.capacity} | Durability: {obj.durability}
      </p>
      {obj.interactions.length > 0 && (
        <div className="mt-1">
          <p className="text-[9px] text-eis-text-muted uppercase tracking-wider">Interactions</p>
          {obj.interactions.map((inter, i) => (
            <div key={i} className="text-[10px] text-eis-text-secondary">
              {inter.name} ({inter.duration} ticks)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
