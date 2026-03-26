import { useState, useCallback } from 'react';
import { parseCSVText, fetchCSV } from '../engine/csv-loader';

interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Hook for loading and manipulating CSV data.
 */
export function useCSVData() {
  const [data, setData] = useState<CSVData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromURL = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCSV(url);
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        setData({ headers, rows: rows as Record<string, string>[] });
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, []);

  const loadFromText = useCallback((text: string) => {
    try {
      const rows = parseCSVText(text);
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        setData({ headers, rows: rows as Record<string, string>[] });
      }
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const loadFromFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      loadFromText(text);
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
    const lines = [data.headers.join(',')];
    for (const row of data.rows) {
      const values = data.headers.map(h => {
        const val = row[h] ?? '';
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }, [data]);

  return {
    data,
    loading,
    error,
    loadFromURL,
    loadFromText,
    loadFromFile,
    updateCell,
    addRow,
    removeRow,
    exportCSV,
  };
}
