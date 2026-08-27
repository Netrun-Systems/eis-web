import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TouchLayout } from './ui/touch/TouchLayout';
import { StatusPage } from './ui/StatusPage';
import { WorldCanvas } from './ui/world/WorldCanvas';
import { CSVEditor } from './ui/csv/CSVEditor';
import { TablesPage } from './ui/tables/TablesPage';
import { TableDetailPage } from './ui/tables/TableDetailPage';
import { VocabularyPage } from './ui/vocabulary/VocabularyPage';
import { VocabularyStemPage } from './ui/vocabulary/VocabularyStemPage';
import { BriefsPage } from './ui/briefs/BriefsPage';
import { BriefEditorPage } from './ui/briefs/BriefEditorPage';

export function App() {
  return (
    <BrowserRouter>
      <TouchLayout>
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/tables" element={<TablesPage />} />
          <Route path="/tables/*" element={<TableDetailPage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
          <Route path="/vocabulary/:stem" element={<VocabularyStemPage />} />
          <Route path="/briefs" element={<BriefsPage />} />
          <Route path="/briefs/:name" element={<BriefEditorPage />} />
          <Route path="/world" element={<WorldCanvas />} />
          <Route path="/csv" element={<CSVEditor />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </TouchLayout>
    </BrowserRouter>
  );
}
