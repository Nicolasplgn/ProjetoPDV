// src/types/index.ts

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  updatedAt: string;
  active: boolean;
}

export interface TransactionItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  discountCents?: number;
}

export interface Transaction {
  clientTransactionId: string;
  serverTransactionId?: string;
  operatorId: string;
  items: TransactionItem[];
  totalCents: number;
  paymentMethod: 'cash' | 'card' | 'mixed' | 'voucher';
  createdAt: string;
  
  // CORREÇÃO: Mudamos o tipo de 'boolean' para 'number'
  // Usaremos 0 para 'false' (não sincronizado) e 1 para 'true' (sincronizado)
  synced: number; 
  
  status: 'pending'|'sent'|'confirmed'|'failed';
  attempts?: number;
  lastError?: string;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator';
}