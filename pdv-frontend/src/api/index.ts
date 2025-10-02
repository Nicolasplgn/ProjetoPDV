// src/api/index.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:3001/api',
});

// Interceptor de REQUISIÇÃO (adiciona o token)
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- NOVA MELHORIA: Interceptor de RESPOSTA (trata erros de autenticação) ---
apiClient.interceptors.response.use(
  // Se a resposta for sucesso (status 2xx), apenas a retorna.
  (response) => response,
  
  // Se a resposta for um erro...
  (error) => {
    // Verifica se o erro é de autenticação (401 Unauthorized ou 403 Forbidden)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log("Token inválido ou expirado. Deslogando o usuário.");
      
      // Limpa os dados de login do storage
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      
      // Força um redirecionamento para a página de login.
      // Isso reseta o estado da aplicação de forma limpa.
      // Usamos window.location.href para garantir um recarregamento completo.
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    
    // Retorna o erro para que outras partes do código (como o .catch) possam tratá-lo.
    return Promise.reject(error);
  }
);

export default apiClient;