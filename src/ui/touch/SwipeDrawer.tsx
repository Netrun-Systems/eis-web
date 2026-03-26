// ============================================================
// EIS Swipe Drawer — Side panel for inventory/stats/quests
// ============================================================

import React from 'react';
import { useSpring, animated, config } from 'react-spring';

interface SwipeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  children: React.ReactNode;
  title?: string;
}

export function SwipeDrawer({ isOpen, onClose, side, children, title }: SwipeDrawerProps) {
  const drawerWidth = Math.min(320, window.innerWidth * 0.8);

  const springProps = useSpring({
    x: isOpen ? 0 : (side === 'left' ? -drawerWidth : drawerWidth),
    opacity: isOpen ? 1 : 0,
    config: config.stiff,
  });

  const backdropSpring = useSpring({
    opacity: isOpen ? 0.4 : 0,
    config: config.default,
  });

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <animated.div
          className="fixed inset-0 bg-black z-30"
          style={{ opacity: backdropSpring.opacity }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <animated.div
        className={`
          fixed top-0 bottom-0 z-40 bg-eis-bg-card border-eis-border overflow-y-auto
          ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'}
        `}
        style={{
          width: drawerWidth,
          transform: springProps.x.to(x => `translateX(${x}px)`),
        }}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-eis-border">
            <h2 className="text-sm font-bold text-eis-text">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-eis-text-muted hover:text-eis-text rounded"
            >
              {'\u{2716}'}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-4">{children}</div>
      </animated.div>
    </>
  );
}
