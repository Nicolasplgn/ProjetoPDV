import apiClient from '../api';
import { db } from '../db/dexie';
import type { Product, Transaction, TransactionItem, User } from '../types';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

export const pullProducts = async () => {
  try {
    console.log('Iniciando pull de produtos do servidor...');
    const response = await apiClient.get<{ products: Product[] }>('/products');
    const serverProducts = response.data.products;
    if (serverProducts && serverProducts.length > 0) {
      await db.products.bulkPut(serverProducts);
      console.log(`${serverProducts.length} produtos sincronizados.`);
    } else {
      console.log('Nenhum produto recebido do servidor.');
    }
  } catch (error) {
    console.error('Falha ao sincronizar produtos:', error);
    throw error;
  }
};

export const pushTransactions = async (transactionsToPush: Transaction[]) => {
  if (transactionsToPush.length === 0) return;

  console.log(`Enviando ${transactionsToPush.length} transações...`);
  const toastId = toast.loading(`Sincronizando ${transactionsToPush.length} venda(s)...`);

  try {
    const response = await apiClient.post<{ results: any[] }>('/sync/push', { transactions: transactionsToPush });
    let successCount = 0;
    for (const result of response.data.results) {
      if (result.status === 'ok' || result.status === 'duplicate') {
        // ADIÇÃO 1: Usar o número 1 para 'true'
        await db.transactions.update(result.clientTransactionId, { synced: 1, status: 'confirmed' });
        successCount++;
      } else {
        await db.transactions.update(result.clientTransactionId, { status: 'failed', lastError: result.error });
        console.error(`O servidor rejeitou a venda ${result.clientTransactionId}: ${result.error}`);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} venda(s) sincronizada(s)!`, { id: toastId });
    } else {
      toast.error('Falha na sincronização. Verifique os dados.', { id: toastId });
    }
  } catch (error) {
    console.error("Erro de rede ao enviar transações.", error);
    toast.error('Falha na conexão. Vendas na fila.', { id: toastId });
    throw error;
  }
};

export const pushPendingTransactions = async (isManual = false) => {
    // ADIÇÃO 2: Fazer a busca pelo NÚMERO 0, que é o valor que vamos padronizar
    const pendingTxs = await db.transactions.where('synced').equals(0).toArray();

    if (pendingTxs.length === 0) {
        if (isManual) {
            toast.success('Nenhuma venda pendente para sincronizar.');
        }
        return;
    }
    
    await pushTransactions(pendingTxs);
};

export const saveAndPushTransaction = async (cartItems: TransactionItem[], user: User): Promise<Transaction> => {
  if (!user) throw new Error("Usuário não autenticado.");
  const newTransaction: Transaction = {
 clientTransactionId: uuidv4(), operatorId: user.id, items: cartItems,
    totalCents: cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    paymentMethod: 'card', createdAt: new Date().toISOString(), 
    
    // ADIÇÃO 3: Usar o NÚMERO 0 para 'false' ao salvar a transação
    synced: 0, 
    
    status: 'pending',
  };
  try {
    await db.transactions.put(newTransaction);
    console.log(`Transação ${newTransaction.clientTransactionId} salva localmente.`);
    
    if (navigator.onLine) {
        try {
            await pushTransactions([newTransaction]);
        } catch (networkError) {
            console.log("Tentativa de envio imediato falhou, venda permanece na fila.");
        }
    }
    return newTransaction;
  } catch (error) {
    console.error("Falha CRÍTICA ao salvar a venda no IndexedDB:", error);
    throw error;
  }
};