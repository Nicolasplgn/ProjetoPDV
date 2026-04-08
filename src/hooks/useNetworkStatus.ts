import { useState, useEffect, useCallback } from 'react';
import { checkRealInternet } from '../utils/network';

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const verifyConnection = useCallback(async () => {
    const online = await checkRealInternet();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    // 1. Verifica logo que a tela abre
    verifyConnection();

    // 2. Heartbeat: testa a internet a cada 5 segundos
    const interval = setInterval(verifyConnection, 5000);

    // 3. Ouvintes nativos do navegador (reage rápido ao cabo/wifi)
    window.addEventListener('online', verifyConnection);
    window.addEventListener('offline', verifyConnection);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', verifyConnection);
      window.removeEventListener('offline', verifyConnection);
    };
  }, [verifyConnection]);

  return isOnline;
};