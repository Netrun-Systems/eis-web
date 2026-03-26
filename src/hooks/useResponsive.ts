// ============================================================
// EIS Responsive Hook — Device detection and breakpoints
// ============================================================

import { useState, useEffect } from 'react';

export type DeviceType = 'phone' | 'tablet' | 'desktop';

export function useResponsive() {
  const [device, setDevice] = useState<DeviceType>(getDevice());
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setDevice(getDevice());
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    device,
    isPhone: device === 'phone',
    isTablet: device === 'tablet',
    isDesktop: device === 'desktop',
    isMobile: device === 'phone' || device === 'tablet',
    windowSize,
  };
}

function getDevice(): DeviceType {
  const w = window.innerWidth;
  if (w < 768) return 'phone';
  if (w <= 1024) return 'tablet';
  return 'desktop';
}
