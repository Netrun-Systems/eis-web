import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTableRows, putTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { TablePutResponse } from '../../api/types';
import { groupQuestColumns } from '../../lib/entityForm';
import { EmptyBox, ErrorBox, HazardChip, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';
import { EntityForm } from '../entity/EntityForm';
import { OBJECTIVES_PATH, QUESTS_PATH } from './QuestsPage';

/**
 * WEB-011 — /quests/:rowname: the quest row as an entity form (same
 * table-level save mechanism as /people), plus its QuestObjectives rows
 * joined by key prefix. Objectives are RAW-READ by C++ (quoteless
 * ParseIntoArray(",")) — rendered read-only here, with the comma rule stated.
 */
export function QuestPage() {
  const { rowname = '' } = useParams();
  const questState = useApi(() => fetchTableRows(QUESTS_PATH), []);
  const objState = useApi(() => fetchTableRows(OBJECTIVES_PATH), []);

  const columns = questState.data?.columns ?? [];
  const rows = questState.data?.rows ?? [];
  const rowIndex = useMemo(() => rows.findIndex((r) => (r[0] ?? '') === rowname), [rows, rowname]);
  const sections = useMemo(() => groupQuestColumns(columns), [columns]);

  // Objective rows key as <QuestID>_<n> (QUEST_062_1…) — join by prefix.
  const objectives = useMemo(
    () => (objState.data?.rows ?? []).filter((r) => (r[0] ?? '').startsWith(`${rowname}_`)),
    [objState.data, rowname],
  );

  const saveRow = async (allRows: string[][], message?: string): Promise<TablePutResponse> => {
    const result = await putTableRows(QUESTS_PATH, { columns, rows: allRows, message });
    if (result.success) questState.reload();
    return result;
  };

  const nameIdx = columns.indexOf('QuestName');
  const row = rowIndex >= 0 ? rows[rowIndex] : null;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="text-xs">
        <Link
          to="/quests"
          className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
        >
          &larr; All quests
        </Link>
      </div>

      {questState.loading && <LoadingBox label="Loading quest" />}
      {questState.error != null && <ErrorBox error={questState.error} />}

      {questState.data && row === null && !questState.loading && (
        <EmptyBox>
          No quest row keyed <code className="font-mono">{rowname}</code> in Quests.csv.
        </EmptyBox>
      )}

      {questState.data && row !== null && (
        <>
          <PageHeader
            eyebrow="People &amp; story"
            title={nameIdx >= 0 ? row[nameIdx] || rowname : rowname}
            context={
              <span className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs">{rowname}</code>
                <span>
                  {sections.length} sections over {columns.length} columns; {objectives.length}{' '}
                  objective{objectives.length === 1 ? '' : 's'} below.
                </span>
              </span>
            }
          />

          <EntityForm
            entry={questState.data.manifestEntry}
            columns={columns}
            rows={rows}
            rowIndex={rowIndex}
            sections={sections}
            saveRow={saveRow}
            contractNote={`The server contract is table-level: Save PUTs the whole ${rows.length}-row table with just this row changed.`}
          />

          <section className="space-y-2">
            <h3 className="flex flex-wrap items-center gap-2 border-b border-dust-200 pb-1 text-sm font-semibold text-dust-900 dark:border-dust-700 dark:text-dust-100">
              Objectives
              <span className="font-mono text-[11px] font-normal tabular-nums text-dust-600 dark:text-dust-400">
                {objectives.length} row{objectives.length === 1 ? '' : 's'} · read-only
              </span>
              <HazardChip title='QuestObjectives.csv is raw-read by C++ with a quoteless ParseIntoArray(",") — a comma in any field silently shifts every later column'>
                raw-read: no commas
              </HazardChip>
            </h3>
            {objState.loading && <LoadingBox label="Loading objectives" />}
            {objState.error != null && <ErrorBox error={objState.error} />}
            {objState.data &&
              (objectives.length === 0 ? (
                <EmptyBox>
                  No QuestObjectives rows key <code className="font-mono">{rowname}_*</code>.
                </EmptyBox>
              ) : (
                <div className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {objState.data.columns.map((c, i) => (
                          <th
                            key={i}
                            className="border-b border-dust-200 bg-dust-0 px-2 py-1.5 text-left font-semibold text-dust-900 dark:border-dust-700 dark:bg-dust-800 dark:text-dust-100"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
                      {objectives.map((r, ri) => (
                        <tr key={ri} className="hover:bg-dust-100 dark:hover:bg-dust-800/60">
                          {r.map((cell, ci) => (
                            <td
                              key={ci}
                              className="max-w-md truncate px-2 py-1 font-mono text-dust-600 dark:text-dust-300"
                              title={cell}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            <p className="text-xs text-dust-600 dark:text-dust-400">
              Objectives are edited in the{' '}
              <Link
                to={`/tables/${OBJECTIVES_PATH}`}
                className="text-petrol-ink hover:underline dark:text-petrol-light"
              >
                table substrate
              </Link>{' '}
              under the raw-read comma ban.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
