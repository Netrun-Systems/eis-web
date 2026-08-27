import { useState, useCallback } from 'react';
import Papa from 'papaparse';

interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Hook for loading and manipulating CSV data.
 * WEB-002: parses with papaparse; files come in via drag-drop only.
 * Server round-trip against the EISCORE repo lands in WEB-003.
 */
export function useCSVData() {
  const [data, setData] = useState<CSVData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromText = useCallback((text: string) => {
    setError(null);
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    if (result.errors.length > 0) {
      setError(result.errors.map(e => `Row ${e.row ?? '?'}: ${e.message}`).join('; '));
    }
    const headers = result.meta.fields ?? [];
    if (headers.length > 0) {
      setData({ headers, rows: result.data });
    }
  }, []);

  const loadFromFile = useCallback((file: File) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      loadFromText(text);
      setLoading(false);
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setLoading(false);
    };
    reader.readAsText(file);
  }, [loadFromText]);

  const updateCell = useCallback((rowIndex: number, column: string, value: string) => {
    setData(prev => {
      if (!prev) return null;
      const newRows = [...prev.rows];
      newRows[rowIndex] = { ...newRows[rowIndex], [column]: value };
      return { ...prev, rows: newRows };
    });
  }, []);

  const addRow = useCallback(() => {
    setData(prev => {
      if (!prev) return null;
      const emptyRow: Record<string, string> = {};
      for (const h of prev.headers) emptyRow[h] = '';
      return { ...prev, rows: [...prev.rows, emptyRow] };
    });
  }, []);

  const removeRow = useCallback((index: number) => {
    setData(prev => {
      if (!prev) return null;
      const newRows = prev.rows.filter((_, i) => i !== index);
      return { ...prev, rows: newRows };
    });
  }, []);

  const exportCSV = useCallback((): string => {
    if (!data) return '';
    return Papa.unparse({ fields: data.headers, data: data.rows.map(r => data.headers.map(h => r[h] ?? '')) });
  }, [data]);

  return {
    data,
    loading,
    error,
    loadFromText,
    loadFromFile,
    updateCell,
    addRow,
    removeRow,
    exportCSV,
  };
}
