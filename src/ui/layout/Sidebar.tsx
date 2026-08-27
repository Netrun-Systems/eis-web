import React from 'react';
import { NavLink } from 'react-router-dom';
import { METHOD_STAGES } from '../../content/method';

/**
 * WEB-014 — the sidebar IS the method. Groups mirror the philosophy's
 * workflow: the method itself, then the vocabulary stages in §3 dependency
 * order, then location design, then data inspection, then tools. The
 * vocabulary entries deep-link to /vocabulary/<stem> with their stage
 * number, so the authoring order is visible from anywhere in the app.
 */

interface NavItem {
  to: string;
  label: string;
  /** Stage number shown as a prefix (vocabulary group). */
  stageNo?: number;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const vocabStages = METHOD_STAGES.filter((s) => s.stem !== undefined);

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'The Method',
    items: [
      { to: '/workflow', label: 'Workflow' },
      { to: '/philosophy', label: 'Philosophy' },
    ],
  },
  {
    label: 'Author the vocabulary',
    items: vocabStages.map((s, i) => ({
      to: s.route,
      label: s.title,
      stageNo: i + 1,
    })),
  },
  {
    label: 'Design locations',
    items: [{ to: '/briefs', label: 'Briefs' }],
  },
  {
    label: 'Inspect the data',
    items: [
      { to: '/data', label: 'Data health' },
      { to: '/tables', label: 'Tables' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/world', label: 'World Canvas' },
      { to: '/csv', label: 'CSV Editor' },
    ],
  },
];

export function Sidebar() {
  return (
    <nav className="w-56 bg-eis-bg-card border-r border-eis-border flex flex-col shrink-0">
      <div className="p-4 border-b border-eis-border">
        <h1 className="text-xl font-bold text-eis-green font-mono tracking-wider">EISWeb</h1>
        <p className="text-xs text-eis-text-muted mt-0.5">World design for EISCORE</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-eis-text-muted">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'text-eis-green bg-eis-green/10 border-r-2 border-eis-green'
                      : 'text-eis-text-secondary hover:text-eis-text hover:bg-eis-bg-hover'
                  }`
                }
              >
                {item.stageNo !== undefined && (
                  <span className="w-4 shrink-0 text-right font-mono text-[10px] text-eis-text-muted">
                    {item.stageNo}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-eis-border">
        <p className="text-xs text-eis-text-muted text-center">Netrun Systems</p>
      </div>
    </nav>
  );
}
