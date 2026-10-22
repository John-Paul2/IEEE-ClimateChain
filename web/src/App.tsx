import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DataProvider } from "./data/DataContext";
import { ToastProvider } from "./components/Toast";
import { AppShell } from "./shell/AppShell";
import { OperatorPage } from "./pages/OperatorPage";
import { VerifierPage } from "./pages/VerifierPage";
import { ImporterPage } from "./pages/ImporterPage";
import { BenchmarkPage } from "./pages/BenchmarkPage";
import { GalleryPage } from "./pages/GalleryPage";

export const App: React.FC = () => {
  return (
    <DataProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/operator" replace />} />
              <Route path="operator" element={<OperatorPage />} />
              <Route path="verifier" element={<VerifierPage />} />
              <Route path="importer" element={<ImporterPage />} />
              <Route path="benchmark" element={<BenchmarkPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="*" element={<Navigate to="/operator" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </DataProvider>
  );
};

export default App;
