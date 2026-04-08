// src/services/syncStatus.ts
//
// Barramento de eventos leve para comunicar o progresso da sincronização
// para qualquer componente React sem precisar de Redux ou Context complexo.
//
// USO NO COMPONENTE:
//
//   import { useSyncStatus } from '../services/syncStatus';
//
//   const { isSyncing, syncStage } = useSyncStatus();
//
//   {isSyncing && (
//     <div className="sync-banner">
//       <Spinner /> {syncStage}
//     </div>
//   )}

import { useEffect, useState } from 'react';

type SyncEvent = {
  isSyncing: boolean;
  stage: string;
};

type Listener = (event: SyncEvent) => void;

const listeners = new Set<Listener>();
let _currentState: SyncEvent = { isSyncing: false, stage: '' };

const emit = (event: SyncEvent) => {
  _currentState = event;
  listeners.forEach((fn) => fn(event));
};

// Chamado pelo syncService para atualizar o estado
export const setSyncStatus = (isSyncing: boolean, stage = '') => {
  emit({ isSyncing, stage });
};

// Hook React para consumir o status em qualquer componente
export const useSyncStatus = () => {
  const [state, setState] = useState<SyncEvent>(_currentState);

  useEffect(() => {
    const handler = (event: SyncEvent) => setState({ ...event });
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return state;
};