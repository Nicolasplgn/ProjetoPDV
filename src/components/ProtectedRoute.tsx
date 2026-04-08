import { Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';

const ProtectedRoute = () => {
  // Se o usuário estiver autenticado, renderiza a página solicitada (PDV)
  // Caso contrário, redireciona para a página de login
  return isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />;
};
export default ProtectedRoute;