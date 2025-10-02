// pdv-backend/src/db/index.ts
import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const dbDir = path.join(__dirname, '..', '..', 'db');
require('fs').mkdirSync(dbDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'pdv.sqlite');
const db = new Database(dbPath);
console.log(`Database connected at: ${dbPath}`);

// Cria as tabelas se não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL, -- Preço em centavos
    stock INTEGER NOT NULL,
    updatedAt TEXT NOT NULL,
    active BOOLEAN NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    clientTransactionId TEXT PRIMARY KEY,
    serverTransactionId TEXT UNIQUE,
    operatorId TEXT NOT NULL,
    items TEXT NOT NULL,
    totalCents INTEGER NOT NULL,
    paymentMethod TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    processedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operatorId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document TEXT UNIQUE, -- CPF ou CNPJ
    phone TEXT,
    email TEXT,
    updatedAt TEXT NOT NULL
  );
`);

// Adiciona usuário admin com um ID FIXO se ele não existir
const defaultUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
if (!defaultUser) {
  const adminId = '00000000-0000-0000-0000-000000000001'; 
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
    .run(adminId, "admin", hashedPassword, "admin");
  console.log("Usuário 'admin' (senha: 'admin123') com ID fixo adicionado.");
}

// Adiciona produtos iniciais se não existirem
const productCount = (db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number }).count;
if (productCount === 0) {
    const stmt = db.prepare("INSERT INTO products (id, sku, name, price, stock, updatedAt, active) VALUES (?, ?, ?, ?, ?, ?, ?)");
    stmt.run(uuidv4(), 'PROD001', 'Café Especial 250g', 2500, 100, new Date().toISOString(), 1);
    stmt.run(uuidv4(), 'PROD002', 'Bolo de Chocolate', 3500, 50, new Date().toISOString(), 1);
    stmt.run(uuidv4(), 'PROD003', 'Pão de Queijo (unid.)', 500, 200, new Date().toISOString(), 1);
    console.log('Produtos iniciais adicionados.');
}


// Adiciona clientes de exemplo se a tabela estiver vazia
// ADIÇÃO APLICADA AQUI para garantir a tipagem correta
const customerCount = (db.prepare("SELECT COUNT(*) as count FROM customers").get() as { count: number }).count;
if (customerCount === 0) {
  db.prepare("INSERT INTO customers (id, name, document, updatedAt) VALUES (?, ?, ?, ?)")
    .run(uuidv4(), 'CLIENTE PADRÃO', '00000000000', new Date().toISOString());
  db.prepare("INSERT INTO customers (id, name, document, updatedAt) VALUES (?, ?, ?, ?)")
    .run(uuidv4(), 'EMPRESA MODELO', '15021308000180', new Date().toISOString());
  console.log("Clientes de exemplo adicionados.");
}

console.log("Database initialized.");
export default db;