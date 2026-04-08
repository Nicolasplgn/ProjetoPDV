// src/api/index.ts

import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  // Evita “travadas” infinitas quando o backend demora com clientes grandes.
  timeout: 120000,
});

apiClient.interceptors.request.use(
  (config) => {
    // 1. Tenta pegar o usuário salvo no localStorage
    const storedUser = localStorage.getItem('currentUser');
    
    let tokenParaUsar = ''; 

    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            
            // REGRA ESTRITA: O UUID é o Token.
            // Se tiver uuid, usa ele. Se tiver token, usa ele.
            if (user.uuid) {
                tokenParaUsar = user.uuid;
            } else if (user.token) {
                tokenParaUsar = user.token;
            }
        } catch (e) { 
            console.error("Erro ao ler dados do usuário:", e); 
        }
    }

    // 2. Injeta o token no Header APENAS se houver um usuário logado.
    // Não usamos mais o VITE_API_TOKEN do .env aqui.
    if (tokenParaUsar) {
        config.headers['token'] = tokenParaUsar;
    }
    
    // Configurações padrão
    if (!config.headers['Accept']) config.headers['Accept'] = 'application/json';
    if (!config.headers['Content-Type']) config.headers['Content-Type'] = 'application/json';

    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;