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
    label: 'Assets',
    items: [
      { to: '/dam', label: 'Overview', end: true },
      { to: '/dam/kit', label: 'Kit coverage' },
      { to: '/dam/packs', label: 'Content packs' },
    ],
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
    <nav className="flex w-56 shrink-0 flex-col border-r border-dust-200 bg-dust-0 dark:border-dust-700 dark:bg-dust-800">
      <div className="border-b border-dust-200 p-4 dark:border-dust-700">
        <h1 className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-dust-900 dark:text-dust-100">
          EIS<span className="text-petrol-ink dark:text-petrol-light">Web</span>
        </h1>
        <p className="mt-1 text-xs text-dust-600 dark:text-dust-400">World design for EISCORE</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="eyebrow px-4 pb-1.5 pt-2.5 !text-[10px]">{group.label}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 border-l-2 py-1.5 pl-[14px] pr-4 text-sm transition-colors ${
                    isActive
                      ? 'border-petrol bg-petrol-wash/70 font-medium text-petrol-ink dark:border-petrol-light dark:bg-petrol-tint/60 dark:text-petrol-light'
                      : 'border-transparent text-dust-600 hover:bg-dust-100 hover:text-dust-900 dark:text-dust-300 dark:hover:bg-dust-700/50 dark:hover:text-dust-100'
                  }`
                }
              >
                {item.stageNo !== undefined && (
                  <span className="w-4 shrink-0 text-right font-mono text-[10px] tabular-nums text-dust-500 dark:text-dust-500">
                    {item.stageNo}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-dust-200 p-3 dark:border-dust-700">
        <p className="text-center font-mono text-[10px] uppercase tracking-eyebrow text-dust-500">
          Netrun Systems
        </p>
      </div>
    </nav>
  );
}
