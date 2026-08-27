import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Status' },
  { to: '/world', label: 'World Canvas' },
  { to: '/csv', label: 'CSV Editor' },
];

export function Sidebar() {
  return (
    <nav className="w-56 bg-eis-bg-card border-r border-eis-border flex flex-col shrink-0">
      <div className="p-4 border-b border-eis-border">
        <h1 className="text-xl font-bold text-eis-green font-mono tracking-wider">EISWeb</h1>
        <p className="text-xs text-eis-text-muted mt-0.5">World design for EISCORE</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-eis-green bg-eis-green/10 border-r-2 border-eis-green'
                  : 'text-eis-text-secondary hover:text-eis-text hover:bg-eis-bg-hover'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="p-3 border-t border-eis-border">
        <p className="text-xs text-eis-text-muted text-center">Netrun Systems</p>
      </div>
    </nav>
  );
}
