// pdv-backend/src/services/productService.ts
import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { productSchema } from '../utils/zodSchemas';

type ProductInput = z.infer<typeof productSchema.shape.body>;

export const getAllProducts = (since?: string): any[] => {
  try {
    if (since && !isNaN(Date.parse(since))) {
      const stmt = db.prepare('SELECT * FROM products WHERE updatedAt > ? AND active = 1');
      return stmt.all(since);
    }
    const stmt = db.prepare('SELECT * FROM products WHERE active = 1');
    return stmt.all();
  } catch(err) {
    console.error("Erro no DB ao buscar todos os produtos:", err);
    return []; // Retorna um array vazio em caso de erro no DB
  }
};

export const createProduct = (productData: ProductInput) => {
  const newProduct = {
    id: uuidv4(),
    updatedAt: new Date().toISOString(),
    ...productData,
    active: 1, // Salva como 1 no DB
  };

  const stmt = db.prepare(`
    INSERT INTO products (id, sku, name, price, stock, updatedAt, active)
    VALUES (@id, @sku, @name, @price, @stock, @updatedAt, @active)
  `);
  
  stmt.run(newProduct);
  return newProduct;
};

export const updateProduct = (id: string, productData: Partial<ProductInput>) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    return null;
  }

  const updatedProduct = {
    ...product,
    ...productData,
    updatedAt: new Date().toISOString(),
  };

  const stmt = db.prepare(`
    UPDATE products
    SET name = @name, sku = @sku, price = @price, stock = @stock, updatedAt = @updatedAt
    WHERE id = @id
  `);

  stmt.run(updatedProduct);
  return updatedProduct;
};

export const deleteProduct = (id: string) => {
  const stmt = db.prepare('UPDATE products SET active = 0, updatedAt = ? WHERE id = ?');
  const info = stmt.run(new Date().toISOString(), id);
  return info.changes > 0;
};