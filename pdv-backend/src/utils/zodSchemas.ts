// pdv-backend/src/utils/zodSchemas.ts
import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Usuário é obrigatório."),
    password: z.string().min(1, "Senha é obrigatória."),
  }),
});

export const productSchema = z.object({
  body: z.object({
    sku: z.string().min(1, "SKU é obrigatório."),
    name: z.string().min(1, "Nome é obrigatório."),
    price: z.number().int().positive("Preço deve ser um número inteiro positivo (em centavos)."),
    stock: z.number().int().min(0, "Estoque não pode ser negativo."),
  }),
});

// ... (o resto do arquivo permanece o mesmo)
export const transactionItemSchema = z.object({
  productId: z.string().uuid("ID do produto inválido."),
  sku: z.string().min(1, "SKU do item é obrigatório."),
  name: z.string().min(1, "Nome do item é obrigatório."),
  unitPrice: z.number().int().positive("Preço unitário deve ser inteiro positivo."),
  quantity: z.number().int().positive("Quantidade deve ser um número inteiro positivo."),
  discountCents: z.number().int().min(0).optional(),
});

export const transactionSchema = z.object({
  clientTransactionId: z.string().uuid("clientTransactionId inválido (UUID esperado)."),
  
  // CORREÇÃO AQUI: Mudamos de .uuid() para .min(1)
  operatorId: z.string().min(1, "operatorId é obrigatório."),
  
  items: z.array(transactionItemSchema).min(1, "Uma transação deve ter pelo menos um item."),
  totalCents: z.number().int().positive("Total da transação deve ser um número inteiro positivo."),
  paymentMethod: z.enum(['cash', 'card', 'mixed', 'voucher']),
  createdAt: z.string().datetime({ message: "createdAt deve ser um timestamp ISO 8601 válido." }),
});
export const syncPushSchema = z.object({
  body: z.object({
    transactions: z.array(transactionSchema),
  }),
});