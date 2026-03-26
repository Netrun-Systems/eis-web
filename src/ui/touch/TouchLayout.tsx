// ============================================================
// EIS Touch Layout — Responsive layout adapter
// Detects device type and renders appropriate layout
// Phone: full-screen map + bottom sheet
// Tablet: split view with side panel
// Desktop: traditional layout with sidebar + header
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useResponsive } from '../../hooks/useResponsive';
import { Sidebar } from '../layout/Sidebar';
import { Header } from '../layout/Header';

interface TouchLayoutProps {
  children: React.ReactNode;
}

/** Routes that use full-screen game view (no sidebar/header on mobile) */
const GAME_ROUTES = ['/play', '/editor', '/observe', '/world-editor', '/map'];

export function TouchLayout({ children }: TouchLayoutProps) {
  const { isPhone, isTablet, isDesktop, isMobile } = useResponsive();
  const location = useLocation();
  const isGameRoute = GAME_ROUTES.some(r => location.pathname.startsWith(r));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  // Desktop layout — keep existing layout
  if (isDesktop) {
    return (
      <div className="flex h-screen overflow-hidden bg-eis-bg">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-4">{children}</main>
        </div>
      </div>
    );
  }

  // Phone/Tablet on game routes — full-screen game view
  if (isGameRoute && isMobile) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-eis-bg">
        {/* Thin top bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-eis-bg-card border-b border-eis-border shrink-0 h-10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-8 h-8 flex items-center justify-center text-eis-text-secondary touch-manipulation"
          >
            {'\u{2630}'}
          </button>
          <span className="text-sm font-mono text-eis-green">EIS</span>
          <div className="w-8" /> {/* Spacer */}
        </div>

        {/* Game content fills remaining space */}
        <main className="flex-1 overflow-hidden relative">{children}</main>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
            <div className="fixed left-0 top-0 bottom-0 w-56 z-40 bg-eis-bg-card border-r border-eis-border overflow-y-auto">
              <Sidebar />
            </div>
          </>
        )}
      </div>
    );
  }

  // Phone/Tablet on non-game routes — simplified layout
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-eis-bg">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-eis-bg-card border-b border-eis-border shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-8 h-8 flex items-center justify-center text-eis-text-secondary touch-manipulation"
        >
          {'\u{2630}'}
        </button>
        <span className="text-sm font-mono text-eis-green">EIS</span>
        <div className="w-8" />
      </div>

      <main className="flex-1 overflow-auto p-3">{children}</main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-56 z-40 bg-eis-bg-card border-r border-eis-border overflow-y-auto">
            <Sidebar />
          </div>
        </>
      )}
    </div>
  );
}
