// src/App.tsx
// Nenhuma importação de React é necessária aqui se não usarmos JSX diretamente.
// Mas se precisarmos, seria apenas UMA VEZ.
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import PosPage from './pages/PosPage';
import PrivateRoute from './components/PrivateRoute';
import { useAuth } from './services/authService';
import './App.css';

// Componente inteligente para a rota de login
const LoginPageOrRedirect = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Carregando...</div>;
  }
  
  // Se já houver um usuário, redireciona. Senão, mostra a página de login.
  return user ? <Navigate to="/" replace /> : <LoginPage />;
};
import { Toaster } from 'react-hot-toast'; // 1. Importe o Toaster
// ... outros imports

function App() {
  return (
    <>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPageOrRedirect />} />
        {/* Rotas que precisam de autenticação ficam aqui dentro */}
        <Route element={<PrivateRoute />}>
          <Route path="/" element={<PosPage />} />
          {/* Futuramente: <Route path="/relatorios" element={<ReportsPage />} /> */}
        </Route>
      </Routes>
    </>
  );
}

export default App;