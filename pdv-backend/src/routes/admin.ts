// pdv-backend/src/routes/admin.ts
import { Router } from 'express';
import db from '../db';

const router = Router();

// Define a interface para o tipo de objeto que esperamos do banco de dados
interface TransactionFromDB {
  items: string; // No DB, 'items' é uma string JSON
  [key: string]: any; // Permite outras propriedades (id, operatorId, etc.)
}

router.get('/', (req, res) => {
  try {
    // Busca as últimas 50 transações
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY processedAt DESC LIMIT 50').all() as TransactionFromDB[];
    
    // Converte a string 'items' em um objeto JavaScript
    const parsedTransactions = transactions.map(tx => {
      try {
        return { ...tx, items: JSON.parse(tx.items) };
      } catch (e) {
        // Se houver um erro no parse, retorna um item de erro para não quebrar a página
        return { ...tx, items: [{ name: 'Erro ao ler itens da venda', quantity: 0 }] };
      }
    });

    // Busca todos os produtos ativos
    const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name ASC').all();
    
    // Renderiza a página 'admin.ejs' e envia os dados para ela
    res.render('admin', { 
      pageTitle: 'Painel do Servidor',
      transactions: parsedTransactions, 
      products 
    });

  } catch (error) {
    console.error("Erro ao carregar o painel de admin:", error);
    res.status(500).render('error', { message: "Erro ao carregar dados do servidor." });
  }
});

export default router;