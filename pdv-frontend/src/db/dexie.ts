// src/db/dexie.ts
import Dexie, { type Table } from 'dexie';
import type { Product, Transaction } from '../types';


export class PDVDatabase extends Dexie {
  products!: Table<Product, string>;
  transactions!: Table<Transaction, string>;

  constructor() {
    super('PDVDatabase');
    this.version(1).stores({
      products: '&id, sku, name, updatedAt',
      // GARANTA QUE 'synced' ESTEJA AQUI NA LISTA DE ÍNDICES
      transactions: '&clientTransactionId, createdAt, synced, status',
    });
  }
}

export const db = new PDVDatabase();