// src/hooks/useAuth.ts

import { useState, useEffect } from 'react';
import type { User } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userString = localStorage.getItem('currentUser');
    if (userString) {
      try {
        setUser(JSON.parse(userString));
      } catch (error) {
        console.error("Falha ao parsear os dados do usuário:", error);
        localStorage.removeItem('currentUser');
      }
    }
  }, []);

  return { user };
};