// ============================================================
// EIS Bottom Sheet — Mobile panel with 3 snap points
// Like Google Maps bottom sheet: peek, half, full
// ============================================================

import React, { useRef, useCallback } from 'react';
import { useSpring, animated, config } from 'react-spring';
import { useDrag } from '@use-gesture/react';

export type SnapPoint = 'peek' | 'half' | 'full' | 'closed';

interface BottomSheetProps {
  children: React.ReactNode;
  snapPoint: SnapPoint;
  onSnapChange: (snap: SnapPoint) => void;
  peekContent?: React.ReactNode;
}

const PEEK_HEIGHT = 60;
const HALF_RATIO = 0.5;
const FULL_RATIO = 0.9;

function getSnapY(snap: SnapPoint, windowHeight: number): number {
  switch (snap) {
    case 'closed': return windowHeight;
    case 'peek': return windowHeight - PEEK_HEIGHT;
    case 'half': return windowHeight * (1 - HALF_RATIO);
    case 'full': return windowHeight * (1 - FULL_RATIO);
  }
}

export function BottomSheet({ children, snapPoint, onSnapChange, peekContent }: BottomSheetProps) {
  const windowHeight = window.innerHeight;
  const targetY = getSnapY(snapPoint, windowHeight);

  const [{ y }, api] = useSpring(() => ({
    y: targetY,
    config: config.stiff,
  }));

  // Update spring when snapPoint changes externally
  React.useEffect(() => {
    api.start({ y: getSnapY(snapPoint, windowHeight) });
  }, [snapPoint, windowHeight, api]);

  const bind = useDrag(
    ({ last, movement: [, my], velocity: [, vy], direction: [, dy], cancel }) => {
      const currentY = getSnapY(snapPoint, windowHeight);

      if (last) {
        const finalY = currentY + my;
        const snapPoints: { snap: SnapPoint; y: number }[] = [
          { snap: 'full', y: getSnapY('full', windowHeight) },
          { snap: 'half', y: getSnapY('half', windowHeight) },
          { snap: 'peek', y: getSnapY('peek', windowHeight) },
        ];

        // Use velocity to determine snap direction
        if (Math.abs(vy) > 0.5) {
          if (dy > 0) {
            // Swiping down
            const below = snapPoints.filter(s => s.y > currentY + my - 20);
            const target = below[0] ?? snapPoints[snapPoints.length - 1];
            onSnapChange(target.snap);
            api.start({ y: target.y });
          } else {
            // Swiping up
            const above = snapPoints.filter(s => s.y < currentY + my + 20);
            const target = above[above.length - 1] ?? snapPoints[0];
            onSnapChange(target.snap);
            api.start({ y: target.y });
          }
        } else {
          // Snap to nearest
          let closest = snapPoints[0];
          let closestDist = Math.abs(finalY - closest.y);
          for (const sp of snapPoints) {
            const dist = Math.abs(finalY - sp.y);
            if (dist < closestDist) {
              closestDist = dist;
              closest = sp;
            }
          }
          onSnapChange(closest.snap);
          api.start({ y: closest.y });
        }
      } else {
        // During drag, move immediately
        api.start({ y: currentY + my, immediate: true });
      }
    },
    {
      from: () => [0, y.get()],
      filterTaps: true,
      bounds: {
        top: getSnapY('full', windowHeight),
        bottom: getSnapY('peek', windowHeight),
      },
      rubberband: true,
    },
  );

  return (
    <>
      {/* Backdrop */}
      {snapPoint !== 'peek' && snapPoint !== 'closed' && (
        <div
          className="fixed inset-0 bg-black/30 z-30 touch-none"
          onClick={() => onSnapChange('peek')}
        />
      )}

      {/* Sheet */}
      <animated.div
        className="fixed left-0 right-0 bg-eis-bg-card border-t border-eis-border rounded-t-2xl z-40 shadow-2xl"
        style={{
          top: y,
          height: windowHeight,
          touchAction: 'none',
        }}
      >
        {/* Drag handle */}
        <div {...bind()} className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-eis-text-muted/40 rounded-full" />
        </div>

        {/* Peek content (always visible) */}
        {peekContent && snapPoint === 'peek' && (
          <div className="px-4 pb-2">{peekContent}</div>
        )}

        {/* Full content (scrollable) */}
        <div
          className="overflow-y-auto px-4 pb-8"
          style={{ maxHeight: windowHeight * FULL_RATIO - 48 }}
        >
          {children}
        </div>
      </animated.div>
    </>
  );
}
