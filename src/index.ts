// src/index.ts

import axios from 'axios';

// 1. Cria uma nova instância do Axios
const apiClient = axios.create({
  // Define a URL base para todas as requisições, lendo do arquivo .env.
  // Isso nos permite mudar de 'dev' para 'produção' facilmente.
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// 2. Configura um interceptor de requisição.
// Esta função é executada ANTES de cada chamada de API feita com 'apiClient'.
apiClient.interceptors.request.use(
  (config) => {
    // Pega o token de autenticação que está definido no arquivo .env.
    const apiToken = import.meta.env.VITE_API_TOKEN;

    // Se o token existir, adiciona-o ao cabeçalho (header) 'token' de cada requisição.
    if (apiToken) {
      config.headers['token'] = apiToken;
    }

    // Define cabeçalhos padrão para garantir a comunicação em JSON, caso não existam.
    if (!config.headers['Accept']) {
        config.headers['Accept'] = 'application/json';
    }
    if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
    }

    // Retorna a configuração modificada para que a requisição possa continuar.
    return config;
  },
  // Função que é executada se houver um erro na configuração da requisição.
  (error) => Promise.reject(error)
);

// 3. Exporta a instância configurada para ser usada em outros lugares do projeto (como no syncService.ts).
export default apiClient;