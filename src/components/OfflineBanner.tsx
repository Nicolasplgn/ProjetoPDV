// src/components/OfflineBanner.tsx
import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useNetworkStatus();

  // Se tem internet, não mostra nada
  if (isOnline) return null;

  // Se está sem internet, mostra uma barra vermelha gigante no topo
  return (
    <div 
      style={{
        backgroundColor: '#dc2626', // Vermelho forte
        color: 'white',
        textAlign: 'center',
        padding: '10px 20px',
        fontWeight: 'bold',
        fontSize: '16px',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        zIndex: 99999, // Fica por cima de TUDO na tela
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      {/* Ícone de Wi-Fi cortado */}
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="24" height="24" 
        viewBox="0 0 24 24" 
        fill="none" stroke="currentColor" 
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <line x1="2" y1="2" x2="22" y2="22" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M5 13a10 10 0 0 1 14 0" />
        <path d="M2 8.5a15 15 0 0 1 20 0" />
      </svg>
      
      <span>
        SISTEMA OFFLINE - Sem conexão com a internet. O PDV continua funcionando e as vendas serão enviadas quando a rede voltar.
      </span>
    </div>
  );
};