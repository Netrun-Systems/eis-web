import React, { useState, useCallback } from 'react';
import { useCSVData } from '../../hooks/useCSVData';
import { PageHeader } from '../layout/PageHeader';

/**
 * CSV grid editor — drag-drop-only mode (WEB-002).
 * A dropped file is parsed and editable in place; export is a
 * client-side download. Server round-trip against the EISCORE
 * repo lands in WEB-003.
 */
export function CSVEditor() {
  const { data, loading, error, loadFromFile, updateCell, addRow, removeRow, exportCSV } = useCSVData();
  const [selectedFile, setSelectedFile] = useState('');
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      setSelectedFile(file.name);
      loadFromFile(file);
    }
  }, [loadFromFile]);

  const handleExport = useCallback(() => {
    const csv = exportCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile || 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportCSV, selectedFile]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tools"
        title="CSV Editor"
        context="Drag-drop only for now — export is a client-side download. Server round-trip (read/write against the EISCORE repo) lands in WEB-003."
      />

      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-dust-600 dark:text-dust-300">{selectedFile}</span>
          <button onClick={addRow} className="btn-quiet px-3 py-1.5 text-sm">
            Add Row
          </button>
          <button onClick={handleExport} className="btn-primary px-3 py-1.5 text-sm">
            Export CSV
          </button>
        </div>
      )}

      {/* Drop zone */}
      {!data && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="cursor-pointer rounded border-2 border-dashed border-dust-200 bg-dust-0/60 py-14 text-center transition-colors hover:border-petrol dark:border-dust-700 dark:bg-dust-800/60 dark:hover:border-petrol-dark"
        >
          <p className="text-sm text-dust-600 dark:text-dust-300">Drop a CSV file here to edit it</p>
          <p className="mt-1 font-mono text-xs text-dust-600 dark:text-dust-400">.csv only</p>
        </div>
      )}

      {loading && (
        <div className="py-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-petrol/40 border-t-transparent dark:border-petrol-dark dark:border-t-transparent" />
          <p className="mt-2 text-xs text-dust-600 dark:text-dust-400">Parsing…</p>
        </div>
      )}

      {error && (
        <div className="rounded border border-rust/50 border-l-2 border-l-rust bg-rust-wash px-3 py-2 text-sm text-rust-dark dark:border-rust-dark dark:border-l-rust-light dark:bg-rust-tint dark:text-rust-light">
          {error}
        </div>
      )}

      {/* Table */}
      {data && (
        <div className="panel overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-dust-0 dark:bg-dust-800">
              <tr className="border-b border-dust-200 dark:border-dust-700">
                <th className="w-8 px-2 py-2 text-left font-mono tabular-nums text-dust-600 dark:text-dust-400">#</th>
                {data.headers.map(h => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-2 py-2 text-left font-medium text-dust-700 dark:text-dust-300"
                  >
                    {h}
                  </th>
                ))}
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-b border-dust-200/60 hover:bg-dust-100 dark:border-dust-700/40 dark:hover:bg-dust-700/50"
                >
                  <td className="px-2 py-1 font-mono tabular-nums text-dust-600 dark:text-dust-400">{rowIdx + 1}</td>
                  {data.headers.map(col => {
                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === col;
                    return (
                      <td key={col} className="px-2 py-1">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={row[col] ?? ''}
                            onChange={e => updateCell(rowIdx, col, e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === 'Escape') setEditingCell(null);
                            }}
                            className="field w-full min-w-[60px] px-1 py-0 font-mono text-xs"
                          />
                        ) : (
                          <span
                            className="block max-w-[200px] cursor-text truncate font-mono text-dust-700 dark:text-dust-200"
                            onClick={() => setEditingCell({ row: rowIdx, col })}
                            title={row[col] ?? ''}
                          >
                            {row[col] || ' '}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1">
                    <button
                      onClick={() => removeRow(rowIdx)}
                      className="text-rust/70 transition-colors hover:text-rust-dark dark:text-rust-light/60 dark:hover:text-rust-light"
                      title="Remove row"
                    >
                      &#x2715;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
