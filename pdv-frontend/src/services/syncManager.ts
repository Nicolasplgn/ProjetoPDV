// pdv-frontend/src/services/syncManager.ts
import toast from 'react-hot-toast';
import { pushPendingTransactions } from './syncService';

let isOnline = navigator.onLine;

const handleStatusChange = () => {
  const online = navigator.onLine;
  if (online && !isOnline) { // Estava offline, agora está online
    console.log("Conexão reestabelecida! Disparando sincronização de vendas pendentes...");
    toast.success('Conexão reestabelecida. Sincronizando vendas...');
    pushPendingTransactions();
  } else if (!online && isOnline) { // Estava online, agora está offline
    console.log("Conexão perdida. Mudando para modo offline.");
    toast.error('Conexão perdida. As vendas serão salvas localmente.');
  }
  isOnline = online;
};

export const startSyncManager = () => {
  window.addEventListener('online', handleStatusChange);
  window.addEventListener('offline', handleStatusChange);
  console.log(`Gerenciador de Sincronização iniciado. Status: ${isOnline ? 'Online' : 'Offline'}`);
  // Tenta uma sincronização inicial ao carregar a página
  setTimeout(pushPendingTransactions, 2000); // Espera 2s para o app carregar
};

export const stopSyncManager = () => {
  window.removeEventListener('online', handleStatusChange);
  window.removeEventListener('offline', handleStatusChange);
  console.log("Gerenciador de Sincronização parado.");
};