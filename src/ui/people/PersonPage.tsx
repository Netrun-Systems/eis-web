import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTableRows, putTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { TablePutResponse } from '../../api/types';
import {
  groupNpcColumns,
  measurePickerViability,
  NPC_REFERENCE_SPECS,
} from '../../lib/entityForm';
import { EmptyBox, ErrorBox, HazardChip, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';
import { EntityForm, type ReferenceBinding } from '../entity/EntityForm';
import { NPCS_PATH, keyToLabel } from './PeoplePage';

/**
 * WEB-011 — /people/:rowname: one NPC as an entity form. The 83 columns are
 * grouped into titled sections derived from the real header
 * (lib/entityForm.ts); reference columns (HeadID, GroupAffiliations,
 * AssignedRoles) render as links + pickers, with viability MEASURED against
 * the target tables — BodyPoolRow stays plain text because its values do not
 * resolve against BodyLibrary. Saving reconstructs the whole table with just
 * this row changed (the server contract is table-level).
 */
export function PersonPage() {
  const { rowname = '' } = useParams();
  const npcState = useApi(() => fetchTableRows(NPCS_PATH), []);
  // The three reference targets (HeadPool, Groups_Definitions, Roles) — one
  // explicit hook each; NPC_REFERENCE_SPECS is a module constant of length 3.
  const target0 = useApi(() => fetchTableRows(NPC_REFERENCE_SPECS[0].targetPath), []);
  const target1 = useApi(() => fetchTableRows(NPC_REFERENCE_SPECS[1].targetPath), []);
  const target2 = useApi(() => fetchTableRows(NPC_REFERENCE_SPECS[2].targetPath), []);
  const targetData = [target0.data, target1.data, target2.data];

  const columns = npcState.data?.columns ?? [];
  const rows = npcState.data?.rows ?? [];
  const rowIndex = useMemo(() => rows.findIndex((r) => (r[0] ?? '') === rowname), [rows, rowname]);

  const sections = useMemo(() => groupNpcColumns(columns), [columns]);

  const references = useMemo(() => {
    const map = new Map<string, ReferenceBinding>();
    NPC_REFERENCE_SPECS.forEach((spec, i) => {
      const target = targetData[i];
      if (!target) return;
      const keys = new Set(target.rows.map((r) => r[0] ?? '').filter((k) => k !== ''));
      const labelIdx =
        spec.labelColumn !== undefined ? target.columns.indexOf(spec.labelColumn) : -1;
      const labels = keyToLabel(target.rows, labelIdx >= 0 ? labelIdx : 1);
      const ci = columns.indexOf(spec.column);
      const viability =
        ci >= 0
          ? measurePickerViability(rows, ci, spec.separator, keys)
          : { viable: false, totalTokens: 0, resolvedTokens: 0, rate: 0 };
      map.set(spec.column, { spec, keys, labels, pickerViable: viability.viable });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target0.data, target1.data, target2.data, columns, rows]);

  const saveRow = async (allRows: string[][], message?: string): Promise<TablePutResponse> => {
    const result = await putTableRows(NPCS_PATH, { columns, rows: allRows, message });
    if (result.success) npcState.reload();
    return result;
  };

  const nameIdx = columns.indexOf('Name');
  const speciesIdx = columns.indexOf('Species');
  const row = rowIndex >= 0 ? rows[rowIndex] : null;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="text-xs">
        <Link
          to="/people"
          className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
        >
          &larr; All NPCs
        </Link>
      </div>

      {npcState.loading && <LoadingBox label="Loading NPC" />}
      {npcState.error != null && <ErrorBox error={npcState.error} />}

      {npcState.data && row === null && !npcState.loading && (
        <EmptyBox>
          No NPC row keyed <code className="font-mono">{rowname}</code> in NPCs.csv.
        </EmptyBox>
      )}

      {npcState.data && row !== null && (
        <>
          <PageHeader
            eyebrow="People &amp; story"
            title={nameIdx >= 0 ? row[nameIdx] || rowname : rowname}
            context={
              <span className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs">{rowname}</code>
                {speciesIdx >= 0 && row[speciesIdx] !== '' && (
                  <span className="chip chip-dust">{row[speciesIdx]}</span>
                )}
                <HazardChip title="NPCs.csv carries 11 pre-existing ;-dense columns — flagged per field; saves are allowed">
                  11 ;-dense columns (pre-existing)
                </HazardChip>
                <span>
                  {sections.length} sections over {columns.length} columns.
                </span>
              </span>
            }
          />

          <EntityForm
            entry={npcState.data.manifestEntry}
            columns={columns}
            rows={rows}
            rowIndex={rowIndex}
            sections={sections}
            references={references}
            saveRow={saveRow}
            contractNote={`The server contract is table-level: Save PUTs the whole ${rows.length}-row table with just this row changed.`}
          />
        </>
      )}
    </div>
  );
}
