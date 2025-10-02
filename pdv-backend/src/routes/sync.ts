import { Router } from 'express';
import { ZodError } from 'zod';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { syncPushSchema } from '../utils/zodSchemas';
import { processTransactions } from '../services/transactionService';
import { getAllProducts } from '../services/productService';

const router = Router();

router.post('/push', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { transactions } = syncPushSchema.parse({ body: req.body }).body;
    
    // Adiciona o operatorId de forma segura a partir do token
    const safeTransactions = transactions.map(tx => ({
        ...tx,
        operatorId: req.user!.userId 
    }));

    const results = processTransactions(safeTransactions);
    res.status(200).json({ results });

  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Payload inválido.', errors: error.issues });
    }
    console.error('Erro no sync/push:', error);
    res.status(500).json({ message: 'Erro interno ao processar transações.' });
  }
});

router.get('/pull', authenticateToken, (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const products = getAllProducts(since);
    res.json({
      updates: {
        products: products,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Erro no sync/pull:', error);
    res.status(500).json({ message: error.message || 'Erro interno ao buscar dados.' });
  }
});

export default router;