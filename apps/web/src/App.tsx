import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthPage } from './pages/AuthPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { EditorPage } from './pages/EditorPage';

export const App: React.FC = () => {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'unknown') {
    return null; // 세션 복원 중 — 깜빡임 방지
  }

  return (
    <Routes>
      <Route path="/login" element={status === 'authed' ? <Navigate to="/projects" replace /> : <AuthPage />} />
      <Route
        path="/projects"
        element={status === 'authed' ? <ProjectsPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/editor/:projectId"
        element={status === 'authed' ? <EditorPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={status === 'authed' ? '/projects' : '/login'} replace />} />
    </Routes>
  );
};
