// src/services/syncManager.ts

import toast from 'react-hot-toast';
import { pushPendingTransactions } from './syncService';

let isOnline = navigator.onLine;

const handleStatusChange = () => {
  const online = navigator.onLine;
  if (online && !isOnline) {
    console.log("Conexão reestabelecida! Disparando sincronização...");
    toast.success('Conexão reestabelecida. Sincronizando vendas...');
    pushPendingTransactions();
  } else if (!online && isOnline) {
    console.log("Conexão perdida. Mudando para modo offline.");
    toast.error('Você está offline. As vendas serão salvas localmente.');
  }
  isOnline = online;
};

export const startSyncManager = () => {
  window.addEventListener('online', handleStatusChange);
  window.addEventListener('offline', handleStatusChange);
  console.log(`Gerenciador de Sincronização iniciado. Status: ${isOnline ? 'Online' : 'Offline'}`);
};