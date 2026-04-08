import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { startSyncManager } from './services/syncManager';

import LoginPage from './pages/LoginPage';
import PosPage from './pages/PosPage';
import ProtectedRoute from './components/ProtectedRoute';
import { isAuthenticated } from './services/authService';
import { OfflineBanner } from './components/OfflineBanner';

function App() {
  useEffect(() => {
    startSyncManager();
  }, []);

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />

      {/* Banner de offline aparece em qualquer rota quando sem internet */}
      <OfflineBanner />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<PosPage />} />
        </Route>

        <Route
          path="*"
          element={<Navigate to={isAuthenticated() ? "/" : "/login"} replace />}
        />
      </Routes>
    </>
  );
}

export default App;