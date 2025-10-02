// src/services/authService.tsx
import { createContext, useState, useContext, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api';
import type { User } from '../types'; // Importação que deve funcionar após reiniciar o TS Server
 // Importação que deve funcionar após reiniciar o TS Server


interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('authUser');
    if (token && storedUser) {
      try {
        // Garantimos que o objeto salvo tenha todos os campos de User
        const parsedUser: User = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (e) {
        console.error("Falha ao analisar dados do usuário, limpando storage.", e);
        localStorage.clear();
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    // AQUI ESTÁ A CORREÇÃO PRINCIPAL
    // Garantimos que a resposta da API corresponda à nossa interface User completa
    const response = await apiClient.post<{ token: string; user: User }>('/auth/login', {
      username,
      password,
    });
    
    // Agora 'loggedInUser' terá id, username, E role.
    const { token: newToken, user: loggedInUser } = response.data;
    
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(loggedInUser));
    
    setToken(newToken);
    setUser(loggedInUser);

    navigate('/');
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  const value = { user, token, login, logout, isLoading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};