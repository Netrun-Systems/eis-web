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
import { WorkflowPage } from './ui/workflow/WorkflowPage';
import { PhilosophyPage } from './ui/philosophy/PhilosophyPage';
import { DamOverviewPage } from './ui/dam/DamOverviewPage';
import { DamKitPage } from './ui/dam/DamKitPage';
import { DamPacksPage } from './ui/dam/DamPacksPage';

export function App() {
  return (
    <BrowserRouter>
      <TouchLayout>
        <Routes>
          {/* WEB-014: the app lands on the method, not on a table dump. */}
          <Route path="/" element={<Navigate to="/workflow" replace />} />
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/philosophy" element={<PhilosophyPage />} />
          <Route path="/data" element={<StatusPage />} />
          <Route path="/tables" element={<TablesPage />} />
          <Route path="/tables/*" element={<TableDetailPage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
          <Route path="/vocabulary/:stem" element={<VocabularyStemPage />} />
          <Route path="/briefs" element={<BriefsPage />} />
          <Route path="/briefs/:name" element={<BriefEditorPage />} />
          <Route path="/dam" element={<DamOverviewPage />} />
          <Route path="/dam/kit" element={<DamKitPage />} />
          <Route path="/dam/packs" element={<DamPacksPage />} />
          <Route path="/world" element={<WorldCanvas />} />
          <Route path="/csv" element={<CSVEditor />} />
          <Route path="*" element={<Navigate to="/workflow" />} />
        </Routes>
      </TouchLayout>
    </BrowserRouter>
  );
}
