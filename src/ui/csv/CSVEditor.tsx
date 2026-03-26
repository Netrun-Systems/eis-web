import React, { useState, useCallback } from 'react';
import { useCSVData } from '../../hooks/useCSVData';

const AVAILABLE_CSVS = [
  'NPCs.csv', 'Needs.csv', 'Behavior.csv', 'Action.csv', 'Traits.csv',
  'Talents.csv', 'Emotions.csv', 'EmotionalContagionRules.csv',
  'TrustEvolutionParameters.csv', 'Relationship.csv',
  'Groups_Definitions.csv', 'Groups.csv', 'FactionReputationMatrix.csv',
  'Item.csv', 'Quests.csv', 'Roles.csv', 'Skills.csv',
  'Knowledge.csv', 'Memory.csv', 'Schedule.csv',
  'Environment.csv', 'WeatherConditions.csv', 'Event.csv', 'Dialogue.csv',
];

export function CSVEditor() {
  const { data, loading, error, loadFromURL, loadFromFile, updateCell, addRow, removeRow, exportCSV } = useCSVData();
  const [selectedFile, setSelectedFile] = useState('');
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);

  const handleLoad = useCallback((file: string) => {
    setSelectedFile(file);
    loadFromURL(`/data/${file}`);
  }, [loadFromURL]);

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
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">CSV Editor</h2>

      {/* File selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={selectedFile}
          onChange={e => handleLoad(e.target.value)}
          className="eis-input"
        >
          <option value="">Select a CSV file...</option>
          {AVAILABLE_CSVS.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {data && (
          <>
            <button onClick={addRow} className="eis-btn-secondary text-sm">Add Row</button>
            <button onClick={handleExport} className="eis-btn-primary text-sm">Export CSV</button>
          </>
        )}
      </div>

      {/* Drop zone */}
      {!data && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="eis-card border-dashed border-2 border-eis-border text-center py-12 cursor-pointer hover:border-eis-green/50"
        >
          <p className="text-eis-text-secondary">Drop a CSV file here or select from the dropdown above</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-4 border-eis-green border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      )}

      {error && (
        <div className="eis-card border-eis-danger/50">
          <p className="text-eis-danger text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      {data && (
        <div className="eis-card p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-eis-bg-card z-10">
              <tr className="border-b border-eis-border">
                <th className="py-2 px-2 text-left text-eis-text-muted w-8">#</th>
                {data.headers.map(h => (
                  <th key={h} className="py-2 px-2 text-left text-eis-text-muted font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th className="py-2 px-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-eis-border/30 hover:bg-eis-bg-hover">
                  <td className="py-1 px-2 text-eis-text-muted">{rowIdx + 1}</td>
                  {data.headers.map(col => {
                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === col;
                    return (
                      <td key={col} className="py-1 px-2">
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
                            className="eis-input py-0 px-1 text-xs w-full min-w-[60px]"
                          />
                        ) : (
                          <span
                            className="text-eis-text cursor-text block truncate max-w-[200px]"
                            onClick={() => setEditingCell({ row: rowIdx, col })}
                            title={row[col] ?? ''}
                          >
                            {row[col] || '\u00A0'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1 px-2">
                    <button
                      onClick={() => removeRow(rowIdx)}
                      className="text-eis-danger/60 hover:text-eis-danger"
                      title="Remove row"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
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
