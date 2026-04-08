// src/services/authService.ts

import apiClient from '../api';
import { db } from '../db/dexie'; // Importação necessária para limpar o banco
import type { User } from '../types';

// Lê o Access ID do arquivo .env
const ACCESS_ID = import.meta.env.VITE_API_ACCESS_ID || "WAI.1b936f43426a9a3645102450d4a5d24c";

interface LoginCredentials {
  login: string;
  password: string;
}

export const login = async (credentials: LoginCredentials): Promise<User> => {
  console.log(`%c[AUTH] Tentando login (Wave) para: ${credentials.login}`, 'color: blue; font-weight: bold;');

  try {
    const response = await apiClient.post<User>(
      '/wave_acesso_usuario',
      {
        login: credentials.login,
        password: credentials.password
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'access-id': ACCESS_ID, 
        },
      }
    );

    const user = response.data;

    // 2. Validação Específica:
    if (!user || !user.uuid) {
        throw new Error("Login falhou: A API não retornou o UUID (Token de acesso).");
    }

    console.log('%c[AUTH] Login realizado com sucesso!', 'color: green; font-weight: bold;', user);
    
    // 3. Normalização:
    // @ts-ignore
    user.token = user.uuid;

    return user;

  } catch (error: any) {
    console.error('%c[AUTH] Erro no login:', 'color: red; font-weight: bold;', error);
    
    let msg = 'Erro ao conectar com o servidor.';
    
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401 || status === 403) {
            msg = 'Usuário ou senha incorretos.';
        } else if (data && (data.message || data.erro || data.detail)) {
            msg = data.message || data.erro || data.detail;
        } else {
            msg = `Erro do servidor: ${status}`;
        }
    } else if (error.request) {
        msg = 'Sem resposta do servidor. Verifique sua conexão.';
    } else {
        msg = error.message;
    }

    throw new Error(msg);
  }
};

// --- ALTERAÇÃO AQUI: Função agora é async para limpar o banco ---
export const logout = async () => {
  // 1. Limpa dados de sessão do navegador
  localStorage.removeItem('currentUser');
  localStorage.removeItem('pdv_cart');
  localStorage.removeItem('pdv_customer');
  localStorage.removeItem('pdv_unidade');
  localStorage.removeItem('pdv_price_table');

  console.log('%c[AUTH] Limpando banco de dados local...', 'color: orange; font-weight: bold;');

  // 2. Limpa todas as tabelas do IndexedDB para não sobrar dados da empresa anterior
  try {
    await Promise.all([
      db.products.clear(),
      db.customers.clear(),
      db.filiais.clear(),
      db.priceTables.clear(),
      db.formasPagamento.clear(),
      db.prazosPagamento.clear(),
      // Opcional: db.transactions.clear() se quiser apagar o histórico de vendas locais também
    ]);
    console.log('%c[AUTH] Banco local limpo com sucesso.', 'color: green;');
  } catch (error) {
    console.error('Erro ao limpar banco de dados:', error);
  }

  console.log('%c[AUTH] Logout efetuado.', 'color: blue; font-weight: bold;');
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('currentUser');
};