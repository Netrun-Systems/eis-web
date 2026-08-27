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

/** Routes that use full-screen canvas view (no sidebar/header on mobile) */
const GAME_ROUTES = ['/world'];

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
      <div className="flex h-screen overflow-hidden bg-dust-50 dark:bg-dust-900">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    );
  }

  // Phone/Tablet on game routes — full-screen game view
  if (isGameRoute && isMobile) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-dust-50 dark:bg-dust-900">
        {/* Thin top bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-dust-0 dark:bg-dust-800 border-b border-dust-200 dark:border-dust-700 shrink-0 h-10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Open navigation"
            className="w-8 h-8 flex items-center justify-center rounded text-dust-600 dark:text-dust-300 touch-manipulation"
          >
            {'\u{2630}'}
          </button>
          <span className="font-display text-base font-bold uppercase tracking-wide text-dust-900 dark:text-dust-100">
            EIS<span className="text-petrol-ink dark:text-petrol-light">Web</span>
          </span>
          <div className="w-8" /> {/* Spacer */}
        </div>

        {/* Game content fills remaining space */}
        <main className="flex-1 overflow-hidden relative">{children}</main>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
            <div className="fixed left-0 top-0 bottom-0 w-56 z-40 bg-dust-0 dark:bg-dust-800 border-r border-dust-200 dark:border-dust-700 overflow-y-auto">
              <Sidebar />
            </div>
          </>
        )}
      </div>
    );
  }

  // Phone/Tablet on non-game routes — simplified layout
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-dust-50 dark:bg-dust-900">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-dust-0 dark:bg-dust-800 border-b border-dust-200 dark:border-dust-700 shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Open navigation"
          className="w-8 h-8 flex items-center justify-center rounded text-dust-600 dark:text-dust-300 touch-manipulation"
        >
          {'\u{2630}'}
        </button>
        <span className="font-display text-base font-bold uppercase tracking-wide text-dust-900 dark:text-dust-100">
          EIS<span className="text-petrol-ink dark:text-petrol-light">Web</span>
        </span>
        <div className="w-8" />
      </div>

      <main className="flex-1 overflow-auto p-4">{children}</main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-56 z-40 bg-dust-0 dark:bg-dust-800 border-r border-dust-200 dark:border-dust-700 overflow-y-auto">
            <Sidebar />
          </div>
        </>
      )}
    </div>
  );
}
