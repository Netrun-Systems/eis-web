import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TouchLayout } from './ui/touch/TouchLayout';
import { StatusPage } from './ui/StatusPage';
import { WorldCanvas } from './ui/world/WorldCanvas';
import { CSVEditor } from './ui/csv/CSVEditor';
import { TablesPage } from './ui/tables/TablesPage';
import { TableDetailPage } from './ui/tables/TableDetailPage';

export function App() {
  return (
    <BrowserRouter>
      <TouchLayout>
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/tables" element={<TablesPage />} />
          <Route path="/tables/*" element={<TableDetailPage />} />
          <Route path="/world" element={<WorldCanvas />} />
          <Route path="/csv" element={<CSVEditor />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </TouchLayout>
    </BrowserRouter>
  );
}
