// src/types/index.ts

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number; // em centavos
  stock: number;
  updatedAt: string; // ISO timestamp
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
  createdAt: string; // ISO
  synced: boolean;
  status: 'pending'|'sent'|'confirmed'|'failed';
  attempts?: number;
  lastError?: string;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator';
}