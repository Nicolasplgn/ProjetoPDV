// pdv-backend/src/routes/products.ts
import { Router } from 'express';
import { ZodError } from 'zod';
import { getAllProducts, createProduct, updateProduct, deleteProduct } from '../services/productService';
import { authenticateToken } from '../middleware/auth';
import { productSchema } from '../utils/zodSchemas';

const router = Router();

// A ROTA problematica é esta
router.get('/', authenticateToken, (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    
    console.log("Executando getAllProducts no service..."); // Log de depuração
    const products = getAllProducts(since);
    
    console.log(`Encontrados ${products.length} produtos.`); // Log de depuração
    
    res.json({
      products,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Erro grave ao buscar produtos:', error);
    res.status(500).json({ message: error.message || 'Erro interno ao buscar produtos.' });
  }
});


// Rotas POST, PUT, DELETE (sem alterações)
router.post('/', authenticateToken, (req, res) => { /* ... */ });
router.put('/:id', authenticateToken, (req, res) => { /* ... */ });
router.delete('/:id', authenticateToken, (req, res) => { /* ... */ });
export default router;