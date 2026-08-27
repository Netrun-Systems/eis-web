// ============================================================
// WEB-010 — the EISCORE world view: WorldLayout's 8x8 grid,
// WorldRegions/WorldPOIs markers, and the three-source region
// inspector (RGN row x RegionCrosswalk x REG generation row).
// The one editable surface is WorldLayout.BiomeType, saved over
// the WEB-003 PUT contract.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../api/useApi';
import { describeApiError, fetchTableRows, putTableRows } from '../../api/client';
import type { TableRowsResponse } from '../../api/types';
import { refusalToFindings } from '../../lib/guardHints';
import { FindingListItem } from '../validation/findings';
import {
  cellKey,
  diffPaints,
  distinctBiomes,
  fracToCell,
  fracToUnit,
  joinRegions,
  layoutRowsWithPaints,
  parseLayoutGrid,
  resolvePoiRegion,
  rowsToRecords,
  stableColorHex,
  type LayoutCell,
  type RegionJoin,
  type Record_,
} from '../../lib/worldBinding';
import {
  EiscoreWorldCanvas,
  type PoiMarker,
  type RegionMarker,
  type WorldSelection,
} from './EiscoreWorldCanvas';

export const WORLD_TABLE_PATHS = {
  layout: 'Data/World/WorldLayout.csv',
  regions: 'Data/World/WorldRegions.csv',
  pois: 'Data/World/WorldPOIs.csv',
  genRegions: 'Data/WorldGen/Regions.csv',
  crosswalk: 'Data/WorldGen/RegionCrosswalk.csv',
} as const;

interface WorldData {
  layout: TableRowsResponse;
  regions: TableRowsResponse;
  pois: TableRowsResponse;
  genRegions: TableRowsResponse;
  crosswalk: TableRowsResponse;
}

const READ_ONLY_CLASSIFICATIONS = new Set(['generated', 'generated_unverified', 'legacy']);

export function EiscoreWorld() {
  const { data, error, loading, reload } = useApi<WorldData>(
    async () => {
      const [layout, regions, pois, genRegions, crosswalk] = await Promise.all([
        fetchTableRows(WORLD_TABLE_PATHS.layout),
        fetchTableRows(WORLD_TABLE_PATHS.regions),
        fetchTableRows(WORLD_TABLE_PATHS.pois),
        fetchTableRows(WORLD_TABLE_PATHS.genRegions),
        fetchTableRows(WORLD_TABLE_PATHS.crosswalk),
      ]);
      return { layout, regions, pois, genRegions, crosswalk };
    },
    [],
  );

  if (loading) {
    return <p className="p-6 text-sm text-dust-600 dark:text-dust-300">Loading world tables…</p>;
  }
  if (error !== null || data === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-rust-dark dark:text-rust-light">{describeApiError(error)}</p>
        <button type="button" onClick={reload} className="btn-quiet mt-2 px-3 py-1.5 text-xs">
          Retry
        </button>
      </div>
    );
  }
  return <LoadedWorld data={data} reload={reload} />;
}

function LoadedWorld({ data, reload }: { data: WorldData; reload: () => void }) {
  const grid = useMemo(
    () => parseLayoutGrid(data.layout.columns, data.layout.rows),
    [data.layout],
  );
  const join = useMemo(
    () => joinRegions(data.regions, data.crosswalk, data.genRegions),
    [data.regions, data.crosswalk, data.genRegions],
  );
  const rgnIds = useMemo(
    () => rowsToRecords(data.regions.columns, data.regions.rows).map((r) => r.RegionID ?? ''),
    [data.regions],
  );

  const regionMarkers = useMemo<RegionMarker[]>(
    () =>
      rowsToRecords(data.regions.columns, data.regions.rows).map((r) => {
        const { u, v } = fracToUnit(Number(r.XFrac), Number(r.YFrac));
        return { id: r.RegionID ?? '', name: r.DisplayName || (r.RegionID ?? ''), u, v };
      }),
    [data.regions],
  );

  const poiRecords = useMemo(() => rowsToRecords(data.pois.columns, data.pois.rows), [data.pois]);
  const poiMarkers = useMemo<PoiMarker[]>(
    () =>
      poiRecords.map((r) => {
        const { u, v } = fracToUnit(Number(r.XFrac), Number(r.YFrac));
        return {
          id: r.POIID ?? '',
          name: r.DisplayName || (r.POIID ?? ''),
          poiType: r.POIType ?? '',
          u,
          v,
          regionId: resolvePoiRegion(r.Region ?? '', rgnIds),
        };
      }),
    [poiRecords, rgnIds],
  );

  // ---- editing state ----
  const [selection, setSelection] = useState<WorldSelection | null>(null);
  const [mode, setMode] = useState<'select' | 'paint'>('select');
  const [paintBiome, setPaintBiome] = useState<string>('Grassland');
  const [paints, setPaints] = useState<Map<string, string>>(new Map());
  const [showPois, setShowPois] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<{ reason: string; detail: unknown } | null>(null);
  const [savedCommit, setSavedCommit] = useState<string | null>(null);

  const layoutWritable = !READ_ONLY_CLASSIFICATIONS.has(data.layout.manifestEntry.classification);
  const dirty = useMemo(() => diffPaints(grid, paints), [grid, paints]);
  const biomes = useMemo(() => distinctBiomes(grid), [grid]);

  const paintCell = useCallback(
    (gx: number, gy: number) => {
      const cell = grid.cells[gy]?.[gx];
      if (!cell) return;
      setPaints((prev) => {
        const next = new Map(prev);
        if (cell.biomeType === paintBiome) next.delete(cell.name);
        else next.set(cellKey(gx, gy), paintBiome);
        return next;
      });
      setSaveFailure(null);
      setSavedCommit(null);
    },
    [grid, paintBiome],
  );

  // Warn on tab close while cells are painted but unsaved.
  useEffect(() => {
    if (dirty.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty.length]);

  const defaultMessage = `eisweb: paint ${dirty.length} WorldLayout cell${dirty.length === 1 ? '' : 's'}`;

  const doSave = async () => {
    setSaving(true);
    setSaveFailure(null);
    setSavedCommit(null);
    try {
      const result = await putTableRows(WORLD_TABLE_PATHS.layout, {
        columns: data.layout.columns,
        rows: layoutRowsWithPaints(data.layout.columns, data.layout.rows, grid, paints),
        message: message.trim() !== '' ? message.trim() : defaultMessage,
      });
      if (result.success) {
        setSavedCommit(result.commit);
        setPaints(new Map());
        setMessage('');
        reload();
      } else {
        // Paint state preserved — nothing is lost on a refusal.
        setSaveFailure({ reason: result.reason, detail: result.detail });
      }
    } catch (e) {
      setSaveFailure({ reason: 'request_failed', detail: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const refusalFindings = useMemo(
    () => (saveFailure === null ? [] : refusalToFindings(saveFailure.reason, saveFailure.detail)),
    [saveFailure],
  );

  const selectedJoin: RegionJoin | null =
    selection?.kind === 'region'
      ? join.joins.find((j) => j.rgnId === selection.id || (j.rgnId === null && j.regId === selection.id)) ?? null
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Counts strip — the real numbers, from the loaded tables. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-dust-200 bg-dust-0 px-3 py-1.5 font-mono text-[11px] text-dust-600 dark:border-dust-700 dark:bg-dust-800 dark:text-dust-400">
        <span>WorldLayout {data.layout.rows.length}</span>
        <span>WorldRegions {data.regions.rows.length}</span>
        <span>WorldGen/Regions {data.genRegions.rows.length}</span>
        <span>Crosswalk {data.crosswalk.rows.length}</span>
        <span>POIs {data.pois.rows.length}</span>
        <span className="text-petrol-ink dark:text-petrol-light">
          {join.rgnMapped} RGN mapped · {join.rgnUnmapped} RGN without generation row ·{' '}
          {join.regUnmapped} REG unmapped
        </span>
        {grid.issues.length > 0 && (
          <span className="text-rust-dark dark:text-rust-light">
            {grid.issues.length} layout issue{grid.issues.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left toolbar: mode, layers, paint palette */}
        <div className="flex w-40 shrink-0 flex-col gap-2 overflow-y-auto border-r border-dust-200 bg-dust-0 p-2 dark:border-dust-700 dark:bg-dust-800">
          <p className="eyebrow !text-[10px]">Tool</p>
          <div className="flex gap-1">
            <ToolButton active={mode === 'select'} onClick={() => setMode('select')}>
              Select
            </ToolButton>
            <ToolButton
              active={mode === 'paint'}
              disabled={!layoutWritable}
              onClick={() => setMode('paint')}
            >
              Paint
            </ToolButton>
          </div>
          {!layoutWritable && (
            <p className="text-[10px] leading-4 text-dust-600 dark:text-dust-400">
              WorldLayout is classified{' '}
              <code className="font-mono">{data.layout.manifestEntry.classification}</code> — not
              editable through EISWeb, so painting is disabled.
            </p>
          )}

          <p className="eyebrow mt-1 !text-[10px]">Layers</p>
          <label className="flex items-center gap-1.5 text-xs text-dust-600 dark:text-dust-300">
            <input type="checkbox" checked={showRegions} onChange={() => setShowRegions((v) => !v)} />
            Region centers
          </label>
          <label className="flex items-center gap-1.5 text-xs text-dust-600 dark:text-dust-300">
            <input type="checkbox" checked={showPois} onChange={() => setShowPois((v) => !v)} />
            POIs
          </label>

          {mode === 'paint' && layoutWritable && (
            <>
              <p className="eyebrow mt-1 !text-[10px]">Biome</p>
              <p className="text-[10px] leading-4 text-dust-600 dark:text-dust-400">
                WorldLayout cells carry no region reference — the paintable classification the
                schema defines is BiomeType.
              </p>
              <div className="flex flex-col gap-1">
                {biomes.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setPaintBiome(b)}
                    className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[11px] transition-colors ${
                      paintBiome === b
                        ? 'border-petrol/50 bg-petrol-wash text-petrol-ink dark:border-petrol-dark dark:bg-petrol-tint dark:text-petrol-light'
                        : 'border-transparent text-dust-600 hover:bg-dust-100 dark:text-dust-300 dark:hover:bg-dust-700/50'
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-dust-900/30"
                      style={{ backgroundColor: stableColorHex(`BIO_${b}`) }}
                    />
                    {b}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Canvas */}
        <div className="min-w-0 flex-1">
          <EiscoreWorldCanvas
            grid={grid}
            paints={paints}
            pois={poiMarkers}
            regions={regionMarkers}
            selection={selection}
            mode={mode}
            showPois={showPois}
            showRegions={showRegions}
            onSelect={setSelection}
            onPaint={paintCell}
          />
        </div>

        {/* Side panel */}
        <SidePanel
          grid={grid}
          paints={paints}
          join={join}
          pois={poiMarkers}
          poiRecords={poiRecords}
          selection={selection}
          onSelect={setSelection}
        />
      </div>

      {/* Save bar — the same contract language as the table editor. */}
      {layoutWritable && (
        <div className="border-t border-dust-200 bg-dust-0 px-3 py-2 dark:border-dust-700 dark:bg-dust-800">
          {saveFailure !== null && (
            <div className="mb-2 space-y-1 rounded border border-rust/50 bg-rust-wash px-3 py-2 dark:border-rust-dark dark:bg-rust-tint">
              <p className="text-sm font-semibold text-rust-dark dark:text-rust-light">
                Save refused — <code className="font-mono">{saveFailure.reason}</code>. Your painted
                cells are preserved.
              </p>
              <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
                {refusalFindings.map((f, i) => (
                  <FindingListItem key={`${f.code}-${i}`} finding={f} />
                ))}
              </ul>
            </div>
          )}
          {savedCommit !== null && (
            <p className="mb-2 rounded border border-petrol/40 bg-petrol-wash px-3 py-1.5 text-sm text-petrol-ink dark:border-petrol-dark dark:bg-petrol-tint dark:text-petrol-light">
              Saved — commit <code className="font-mono">{savedCommit.slice(0, 12)}</code> in the
              EISCORE repo.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs tabular-nums text-dust-600 dark:text-dust-300">
              {dirty.length} cell{dirty.length === 1 ? '' : 's'} painted
              {dirty.length > 0 &&
                ` (${dirty
                  .slice(0, 4)
                  .map((d) => `${d.name}: ${d.from}→${d.to}`)
                  .join(', ')}${dirty.length > 4 ? ', …' : ''})`}
            </span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={defaultMessage}
              title="Commit message (optional — placeholder shows the default)"
              className="field min-w-52 flex-1 px-2 py-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => void doSave()}
              disabled={dirty.length === 0 || saving}
              className="btn-primary px-2.5 py-1 text-xs"
            >
              {saving ? 'Saving…' : 'Save to WorldLayout.csv'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Discard all painted cells?')) {
                  setPaints(new Map());
                  setSaveFailure(null);
                }
              }}
              disabled={dirty.length === 0 || saving}
              className="btn-quiet px-2.5 py-1 text-xs"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panel: inspector + region list + POI list
// ---------------------------------------------------------------------------

function SidePanel({
  grid,
  paints,
  join,
  pois,
  poiRecords,
  selection,
  onSelect,
}: {
  grid: ReturnType<typeof parseLayoutGrid>;
  paints: ReadonlyMap<string, string>;
  join: ReturnType<typeof joinRegions>;
  pois: PoiMarker[];
  poiRecords: Record_[];
  selection: WorldSelection | null;
  onSelect: (sel: WorldSelection) => void;
}) {
  const [tab, setTab] = useState<'inspect' | 'regions' | 'pois'>('inspect');
  const [poiFilter, setPoiFilter] = useState('');
  const listRefs = useRef(new Map<string, HTMLButtonElement>());

  // A canvas selection pulls the panel to the inspector; a POI selected from
  // the canvas also scrolls its list row into view when the list is open.
  useEffect(() => {
    if (selection !== null && tab !== 'pois') setTab('inspect');
    if (selection?.kind === 'poi') {
      listRefs.current.get(selection.id)?.scrollIntoView({ block: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const filteredPois = useMemo(() => {
    const q = poiFilter.trim().toLowerCase();
    if (q === '') return pois;
    return pois.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.poiType.toLowerCase().includes(q) ||
        (p.regionId ?? '').toLowerCase().includes(q),
    );
  }, [pois, poiFilter]);

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-dust-200 bg-dust-0 dark:border-dust-700 dark:bg-dust-800">
      <div className="flex border-b border-dust-200 dark:border-dust-700">
        {(['inspect', 'regions', 'pois'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 px-2 py-1.5 text-xs capitalize transition-colors ${
              tab === t
                ? 'border-petrol font-medium text-petrol-ink dark:border-petrol-light dark:text-petrol-light'
                : 'border-transparent text-dust-600 hover:text-dust-900 dark:text-dust-400 dark:hover:text-dust-100'
            }`}
          >
            {t === 'pois' ? `POIs (${pois.length})` : t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'inspect' && (
          <Inspector
            grid={grid}
            paints={paints}
            join={join}
            pois={pois}
            poiRecords={poiRecords}
            selection={selection}
            onSelect={onSelect}
          />
        )}

        {tab === 'regions' && (
          <div className="space-y-0.5">
            {join.joins.map((j) => {
              const id = j.rgnId ?? j.regId ?? '';
              const selected = selection?.kind === 'region' && selection.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect({ kind: 'region', id })}
                  className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors ${
                    selected
                      ? 'bg-petrol-wash text-petrol-ink dark:bg-petrol-tint dark:text-petrol-light'
                      : 'text-dust-600 hover:bg-dust-100 dark:text-dust-300 dark:hover:bg-dust-700/50'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stableColorHex(id) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{j.displayName}</span>
                  <MatchBasisChip basis={j.matchBasis} />
                </button>
              );
            })}
          </div>
        )}

        {tab === 'pois' && (
          <div className="flex h-full flex-col gap-2">
            <input
              value={poiFilter}
              onChange={(e) => setPoiFilter(e.target.value)}
              placeholder={`Filter ${pois.length} POIs…`}
              className="field w-full px-2 py-1 text-xs"
            />
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {filteredPois.map((p) => {
                const selected = selection?.kind === 'poi' && selection.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    ref={(el) => {
                      if (el) listRefs.current.set(p.id, el);
                      else listRefs.current.delete(p.id);
                    }}
                    onClick={() => onSelect({ kind: 'poi', id: p.id })}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors ${
                      selected
                        ? 'bg-petrol-wash text-petrol-ink dark:bg-petrol-tint dark:text-petrol-light'
                        : 'text-dust-600 hover:bg-dust-100 dark:text-dust-300 dark:hover:bg-dust-700/50'
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rotate-45"
                      style={{ backgroundColor: stableColorHex(p.regionId ?? 'RGN_unresolved') }}
                    />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-dust-500">{p.poiType}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function Inspector({
  grid,
  paints,
  join,
  pois,
  poiRecords,
  selection,
  onSelect,
}: {
  grid: ReturnType<typeof parseLayoutGrid>;
  paints: ReadonlyMap<string, string>;
  join: ReturnType<typeof joinRegions>;
  pois: PoiMarker[];
  poiRecords: Record_[];
  selection: WorldSelection | null;
  onSelect: (sel: WorldSelection) => void;
}) {
  if (selection === null) {
    return (
      <p className="p-2 text-xs text-dust-600 dark:text-dust-400">
        Click a cell, a region center, or a POI marker to inspect it.
      </p>
    );
  }

  if (selection.kind === 'cell') {
    const cell = grid.cells[selection.y]?.[selection.x] ?? null;
    if (cell === null) {
      return (
        <p className="p-2 text-xs text-dust-600 dark:text-dust-400">
          Cell {selection.x}_{selection.y} has no WorldLayout row.
        </p>
      );
    }
    return <CellInspector cell={cell} paints={paints} pois={pois} onSelect={onSelect} />;
  }

  if (selection.kind === 'poi') {
    const marker = pois.find((p) => p.id === selection.id) ?? null;
    const record = poiRecords.find((r) => (r.POIID ?? '') === selection.id) ?? null;
    if (marker === null || record === null) return null;
    return <PoiInspector marker={marker} record={record} onSelect={onSelect} />;
  }

  const j =
    join.joins.find(
      (x) => x.rgnId === selection.id || (x.rgnId === null && x.regId === selection.id),
    ) ?? null;
  if (j === null) return null;
  return <RegionInspector join={j} />;
}

function CellInspector({
  cell,
  paints,
  pois,
  onSelect,
}: {
  cell: LayoutCell;
  paints: ReadonlyMap<string, string>;
  pois: PoiMarker[];
  onSelect: (sel: WorldSelection) => void;
}) {
  const painted = paints.get(cell.name);
  const cellPois = pois.filter((p) => {
    const c = fracToCell(p.u, 1 - p.v);
    return c.col === cell.gridX && c.row === cell.gridY;
  });
  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="eyebrow !text-[10px]">WorldLayout cell</p>
        <p className="font-mono text-sm text-dust-900 dark:text-dust-100">{cell.name}</p>
      </div>
      <Field label="BiomeType">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: stableColorHex(`BIO_${painted ?? cell.biomeType}`) }}
          />
          {painted !== undefined && painted !== cell.biomeType ? (
            <>
              <s className="text-dust-500">{cell.biomeType}</s> {painted}{' '}
              <span className="chip chip-petrol">unsaved</span>
            </>
          ) : (
            cell.biomeType
          )}
        </span>
      </Field>
      <Field label="SettlementType">{cell.settlementType || '—'}</Field>
      <Field label="Elevation">
        base {cell.record.ElevationBase} · range {cell.record.ElevationRange}
      </Field>
      <Field label="Moisture / Temperature">
        {cell.record.MoistureLevel} / {cell.record.TemperatureLevel}
      </Field>
      <Field label="Description">{cell.description}</Field>
      {cellPois.length > 0 && (
        <div>
          <p className="eyebrow !text-[10px]">POIs in this cell ({cellPois.length})</p>
          <div className="mt-1 space-y-0.5">
            {cellPois.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect({ kind: 'poi', id: p.id })}
                className="block w-full truncate rounded px-1 py-0.5 text-left text-dust-600 hover:bg-dust-100 dark:text-dust-300 dark:hover:bg-dust-700/50"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PoiInspector({
  marker,
  record,
  onSelect,
}: {
  marker: PoiMarker;
  record: Record_;
  onSelect: (sel: WorldSelection) => void;
}) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="eyebrow !text-[10px]">POI · {marker.poiType}</p>
        <p className="text-sm font-medium text-dust-900 dark:text-dust-100">{marker.name}</p>
        <p className="font-mono text-[10px] text-dust-500">{marker.id}</p>
      </div>
      <Field label="Region">
        {marker.regionId !== null ? (
          <button
            type="button"
            onClick={() => onSelect({ kind: 'region', id: marker.regionId as string })}
            className="inline-flex items-center gap-1.5 text-petrol-ink hover:underline dark:text-petrol-light"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: stableColorHex(marker.regionId) }}
            />
            {marker.regionId}
          </button>
        ) : (
          <>
            {record.Region} <span className="chip chip-dust">unresolved</span>
          </>
        )}
      </Field>
      <Field label="Faction">{record.Faction || '—'}</Field>
      <Field label="Position">
        XFrac {record.XFrac} · YFrac {record.YFrac} · radius {record.Radius}
      </Field>
      {record.QuestLinks !== '' && (
        <Field label="QuestLinks">
          <ChipList value={record.QuestLinks} />
        </Field>
      )}
      <Field label="Description">{record.Description}</Field>
    </div>
  );
}

/** The three-source join: RGN row, crosswalk row (with MatchBasis), REG row. */
function RegionInspector({ join: j }: { join: RegionJoin }) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="eyebrow !text-[10px]">Region</p>
        <p className="flex items-center gap-1.5 text-sm font-medium text-dust-900 dark:text-dust-100">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: stableColorHex(j.rgnId ?? j.regId ?? '') }}
          />
          {j.displayName}
        </p>
      </div>

      {/* 1 — the gameplay row (WorldRegions) */}
      <section className="panel space-y-1.5 p-2">
        <p className="eyebrow !text-[10px]">
          Gameplay — WorldRegions {j.rgn === null && <span className="chip chip-dust">no RGN row</span>}
        </p>
        {j.rgn !== null && (
          <>
            <p className="font-mono text-[10px] text-dust-500">{j.rgnId}</p>
            <Field label="Faction">{j.rgn.Faction || '—'}</Field>
            <Field label="BiomeType">{j.rgn.BiomeType || '—'}</Field>
            <Field label="MaxActiveNPCs">{j.rgn.MaxActiveNPCs || '—'}</Field>
            <Field label="Creatures">
              <ChipList value={j.rgn.CreatureTypes} strip="CREATURE_" />
            </Field>
            <Field label="SmartObjectPreset">{j.rgn.SmartObjectPreset || '—'}</Field>
          </>
        )}
        {j.rgn === null && (
          <p className="text-dust-600 dark:text-dust-400">
            This generation region has no WorldRegions counterpart.
          </p>
        )}
      </section>

      {/* 2 — the crosswalk row */}
      <section className="panel space-y-1.5 p-2">
        <p className="eyebrow flex items-center gap-1.5 !text-[10px]">
          Crosswalk <MatchBasisChip basis={j.matchBasis} />
        </p>
        {j.matchBasis === 'none' ? (
          <p className="text-dust-600 dark:text-dust-400">
            No crosswalk row — this gameplay region is not mapped by the world-generation
            pipeline.
          </p>
        ) : (
          <>
            <p className="text-dust-600 dark:text-dust-300">
              {j.regId ?? '—'} &harr; {j.rgnId ?? 'no canonical region'}
            </p>
            {j.crosswalkNotes !== '' && (
              <p className="italic text-dust-600 dark:text-dust-400">
                &ldquo;{j.crosswalkNotes}&rdquo;
              </p>
            )}
          </>
        )}
      </section>

      {/* 3 — the generation row (WorldGen/Regions) */}
      <section className="panel space-y-1.5 p-2">
        <p className="eyebrow !text-[10px]">
          Generation — WorldGen/Regions{' '}
          {j.reg === null && <span className="chip chip-dust">no REG row</span>}
        </p>
        {j.reg !== null ? (
          <>
            <p className="font-mono text-[10px] text-dust-500">{j.regId}</p>
            <Field label="RegionType">{j.reg.RegionType || '—'}</Field>
            <Field label="Biomes">
              {j.reg.PrimaryBiome}
              {j.reg.SecondaryBiome !== '' && ` / ${j.reg.SecondaryBiome}`}
            </Field>
            <Field label="Materials">
              <ChipList value={[j.reg.PrimaryMaterials, j.reg.SecondaryMaterials].filter(Boolean).join('|')} />
            </Field>
            <Field label="StructureFamilies">
              <ChipList value={j.reg.StructureFamilies} />
            </Field>
            <Field label="Hazards">
              <ChipList value={j.reg.HazardTags} />
            </Field>
            <Field label="PCGTags">
              <ChipList value={j.reg.PCGTags} />
            </Field>
            {j.reg.LandmarkTags !== '' && (
              <Field label="Landmarks">
                <ChipList value={j.reg.LandmarkTags} />
              </Field>
            )}
            {j.reg.Notes !== '' && <Field label="Notes">{j.reg.Notes}</Field>}
          </>
        ) : (
          <p className="text-dust-600 dark:text-dust-400">
            No generation row — the world-gen vocabulary does not describe this region.
          </p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small bits
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-mono text-[10px] uppercase tracking-wide text-dust-500">{label}</span>
      <div className="text-dust-800 dark:text-dust-200">{children}</div>
    </div>
  );
}

/** |- or ;-separated multi-value as chips. */
function ChipList({ value, strip }: { value: string; strip?: string }) {
  const parts = value.split(/[|;]/).map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length === 0) return <span>—</span>;
  return (
    <span className="flex flex-wrap gap-1 pt-0.5">
      {parts.map((p, i) => (
        <span key={`${p}-${i}`} className="chip chip-dust">
          {strip !== undefined && p.startsWith(strip) ? p.slice(strip.length) : p}
        </span>
      ))}
    </span>
  );
}

function MatchBasisChip({ basis }: { basis: RegionJoin['matchBasis'] }) {
  if (basis === 'name') return <span className="chip chip-petrol">name</span>;
  if (basis === 'override') return <span className="chip chip-amber">override</span>;
  if (basis === 'no-counterpart') return <span className="chip chip-info">no-counterpart</span>;
  return <span className="chip chip-dust">no crosswalk row</span>;
}

function ToolButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-petrol/50 bg-petrol-wash text-petrol-ink dark:border-petrol-dark dark:bg-petrol-tint dark:text-petrol-light'
          : 'border-dust-200 bg-dust-50 text-dust-600 hover:bg-dust-100 dark:border-dust-700 dark:bg-dust-900 dark:text-dust-300 dark:hover:bg-dust-700/50'
      }`}
    >
      {children}
    </button>
  );
}
