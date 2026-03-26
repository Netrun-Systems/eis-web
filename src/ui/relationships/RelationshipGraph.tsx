import React, { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getFactionForNPC, getFactionColor } from '../../engine/world';

interface GraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  species: string;
}

interface GraphEdge {
  source: string;
  target: string;
  trust: number;
}

export function RelationshipGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { world, tickCounter } = useSimulationStore();
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0,
  });

  // Initialize nodes and edges from world data
  useEffect(() => {
    if (!world) return;

    // Build nodes (only NPCs with relationships)
    const involvedIds = new Set<string>();
    for (const rel of world.relationships) {
      involvedIds.add(rel.entities[0]);
      involvedIds.add(rel.entities[1]);
    }

    const existingPositions = new Map<string, { x: number; y: number }>();
    for (const node of nodesRef.current) {
      existingPositions.set(node.id, { x: node.x, y: node.y });
    }

    nodesRef.current = world.npcs
      .filter(npc => involvedIds.has(npc.id))
      .map(npc => {
        const faction = getFactionForNPC(world, npc);
        const existing = existingPositions.get(npc.id);
        return {
          id: npc.id,
          name: npc.name,
          x: existing?.x ?? 100 + Math.random() * 600,
          y: existing?.y ?? 100 + Math.random() * 400,
          vx: 0,
          vy: 0,
          color: faction ? getFactionColor(faction.name) : '#5a6878',
          species: npc.species,
        };
      });

    edgesRef.current = world.relationships.map(rel => ({
      source: rel.entities[0],
      target: rel.entities[1],
      trust: rel.currentTrustLevel,
    }));
  }, [world?.npcs.length, world?.relationships.length]);

  // Force simulation
  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (nodes.length === 0) return;

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = 2000 / (dist * dist);
        dx /= dist;
        dy /= dist;
        nodes[i].vx -= dx * force;
        nodes[i].vy -= dy * force;
        nodes[j].vx += dx * force;
        nodes[j].vy += dy * force;
      }
    }

    // Attraction (edges)
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const edge of edges) {
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;

      let dx = t.x - s.x;
      let dy = t.y - s.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const idealDist = 100 + (10 - edge.trust) * 15;
      const force = (dist - idealDist) * 0.005;
      dx /= dist;
      dy /= dist;
      s.vx += dx * force;
      s.vy += dy * force;
      t.vx -= dx * force;
      t.vy -= dy * force;
    }

    // Center gravity
    const cx = 400, cy = 300;
    for (const node of nodes) {
      node.vx += (cx - node.x) * 0.001;
      node.vy += (cy - node.y) * 0.001;
    }

    // Apply velocity with damping
    for (const node of nodes) {
      if (node.id === dragRef.current.nodeId) continue;
      node.vx *= 0.9;
      node.vy *= 0.9;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(20, Math.min(780, node.x));
      node.y = Math.max(20, Math.min(580, node.y));
    }
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      simulate();

      // Clear
      ctx.fillStyle = '#0f1419';
      ctx.fillRect(0, 0, w, h);

      const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

      // Draw edges
      for (const edge of edgesRef.current) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        const trust = edge.trust;
        const r = trust < 5 ? 200 : Math.max(0, 200 - (trust - 5) * 40);
        const g = trust > 3 ? Math.min(200, (trust - 3) * 30) : 0;
        const alpha = 0.3 + (trust / 10) * 0.4;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = `rgba(${r}, ${g}, 80, ${alpha})`;
        ctx.lineWidth = 0.5 + (trust / 10) * 2;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodesRef.current) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = '#0f1419';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = '#e0e6ed';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y - 14);
      }

      animRef.current = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(animRef.current);
  }, [simulate, tickCounter]);

  // Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const node of nodesRef.current) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        dragRef.current = { nodeId: node.id, offsetX: dx, offsetY: dy };
        break;
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.nodeId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
    if (node) {
      node.x = e.clientX - rect.left + dragRef.current.offsetX;
      node.y = e.clientY - rect.top + dragRef.current.offsetY;
      node.vx = 0;
      node.vy = 0;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Relationship Graph</h2>
      <p className="text-sm text-eis-text-secondary">
        Drag nodes to rearrange. Edge color: green = high trust, red = low trust. Edge thickness = trust level.
      </p>
      <div className="eis-card p-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
          style={{ height: '600px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}
