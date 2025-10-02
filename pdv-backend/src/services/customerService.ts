// pdv-backend/src/services/customerService.ts
import db from '../db';
import { v4 as uuidv4 } from 'uuid';

export const searchCustomers = (query: string) => {
  // Busca por nome ou documento
  const stmt = db.prepare(`
    SELECT * FROM customers 
    WHERE name LIKE ? OR document LIKE ? 
    LIMIT 20
  `);
  const searchQuery = `%${query}%`;
  return stmt.all(searchQuery, searchQuery);
};