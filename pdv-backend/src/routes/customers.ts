// pdv-backend/src/routes/customers.ts
import { Router } from 'express';
import { searchCustomers } from '../services/customerService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/customers/search?q=...
router.get('/search', authenticateToken, (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ message: 'Parâmetro de busca "q" é obrigatório.' });
  }
  try {
    const customers = searchCustomers(query);
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar clientes.' });
  }
});

export default router;