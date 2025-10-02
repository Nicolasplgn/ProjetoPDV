import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { transactionSchema } from '../utils/zodSchemas';
import { z } from 'zod';

type Transaction = z.infer<typeof transactionSchema>;

interface SyncResult {
  clientTransactionId: string;
  status: 'ok' | 'failed' | 'duplicate';
  serverTransactionId?: string;
  error?: string;
}

export const processTransactions = (transactions: Transaction[]): SyncResult[] => {
  const results: SyncResult[] = [];

  const findStmt = db.prepare('SELECT serverTransactionId FROM transactions WHERE clientTransactionId = ?');
  
  const processSingleTx = db.transaction((tx: Transaction): void => {
    // 1. Checar por duplicatas (Idempotência)
    const existing = findStmt.get(tx.clientTransactionId);
    if (existing) {
      results.push({
        clientTransactionId: tx.clientTransactionId,
        status: 'duplicate',
        serverTransactionId: (existing as any).serverTransactionId,
      });
      return; // Pula para a próxima transação
    }

    // 2. Validar estoque e subtrair
    const updateStockStmt = db.prepare('UPDATE products SET stock = stock - ?, updatedAt = ? WHERE id = ? AND stock >= ?');
    const now = new Date().toISOString();
    for (const item of tx.items) {
      const info = updateStockStmt.run(item.quantity, now, item.productId, item.quantity);
      if (info.changes === 0) { // Se nenhuma linha foi afetada, o estoque era insuficiente
        throw new Error(`Estoque insuficiente para o produto SKU ${item.sku}.`);
      }
    }
    
    // 3. Inserir a transação
    const serverTransactionId = uuidv4();
    const insertTxStmt = db.prepare(`
      INSERT INTO transactions (clientTransactionId, serverTransactionId, operatorId, items, totalCents, paymentMethod, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertTxStmt.run(
      tx.clientTransactionId,
      serverTransactionId,
      tx.operatorId,
      JSON.stringify(tx.items),
      tx.totalCents,
      tx.paymentMethod,
      tx.createdAt,
    );
    
    results.push({
      clientTransactionId: tx.clientTransactionId,
      status: 'ok',
      serverTransactionId,
    });
  });

  for (const tx of transactions) {
    try {
      processSingleTx(tx);
    } catch (err: any) {
      console.error(`Falha ao processar transação ${tx.clientTransactionId}:`, err.message);
      results.push({
        clientTransactionId: tx.clientTransactionId,
        status: 'failed',
        error: err.message,
      });
      // A transação do SQLite garante o rollback automático em caso de erro.
    }
  }
  
  return results;
};