import React, { useRef, useEffect } from 'react';
import type { PersonalityTraits } from '../../engine/types';
import { PERSONALITY_TRAIT_KEYS } from '../../engine/types';

interface Props {
  personality: PersonalityTraits;
  size?: number;
}

const TRAIT_LABELS: Record<keyof PersonalityTraits, string> = {
  aggression: 'AGG',
  friendliness: 'FRD',
  curiosity: 'CUR',
  fearfulness: 'FEA',
  loyalty: 'LOY',
  independence: 'IND',
  confidence: 'CON',
  patience: 'PAT',
  honesty: 'HON',
  empathy: 'EMP',
  resourcefulness: 'RES',
  greed: 'GRD',
  generosity: 'GEN',
  survivalInstinct: 'SRV',
};

export function PersonalityRadar({ personality, size = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.35;
    const traits = PERSONALITY_TRAIT_KEYS;
    const n = traits.length;
    const angleStep = (2 * Math.PI) / n;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw grid rings
    for (let ring = 1; ring <= 5; ring++) {
      const r = (ring / 5) * radius;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === 5 ? '#2a3544' : '#1e2630';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw axis lines
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.strokeStyle = '#1e2630';
      ctx.stroke();
    }

    // Draw data polygon
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const angle = idx * angleStep - Math.PI / 2;
      const val = personality[traits[idx]] / 10;
      const r = val * radius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(144, 185, 171, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#90b9ab';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw data points
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const val = personality[traits[i]] / 10;
      const r = val * radius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#90b9ab';
      ctx.fill();
    }

    // Draw labels
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const labelR = radius + 18;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);

      ctx.fillStyle = '#8b99a8';
      ctx.fillText(TRAIT_LABELS[traits[i]], x, y);

      // Value
      ctx.fillStyle = '#5a6878';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText(personality[traits[i]].toFixed(1), x, y + 11);
      ctx.font = '10px Inter, sans-serif';
    }
  }, [personality, size]);

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="touch-none"
      />
    </div>
  );
}
