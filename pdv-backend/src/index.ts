// pdv-backend/src/index.ts
import express from 'express'; // Importado apenas uma vez
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path'; // Importa o 'path' do Node.js

// Importa todas as suas rotas
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import syncRoutes from './routes/sync';
import customerRoutes from './routes/customers';
import adminRoutes from './routes/admin';

// Carrega as variáveis de ambiente
dotenv.config();

const app = express(); // Criado apenas uma vez
const PORT = process.env.PORT || 3001;

// --- Configuração dos Middlewares ---
app.use(cors());       // Habilita CORS para as APIs
app.use(express.json()); // Habilita o parsing de body JSON

// --- Configuração do View Engine (EJS) ---
app.set('view engine', 'ejs');
// __dirname se refere ao diretório atual. Em produção (após compilar para JS), ele estará em 'dist/'.
// Em desenvolvimento (com ts-node-dev), ele estará em 'src/'. O path.join resolve isso.
app.set('views', path.join(__dirname, 'views'));


// --- Definição das Rotas ---

// Rotas da API (prefixo /api)
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/customers', customerRoutes);

// Rota do Painel de Admin Visual (sem o prefixo /api)
app.use('/admin', adminRoutes);

// Rota de Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rota raiz para uma mensagem de boas-vindas
app.get('/', (req, res) => {
  res.send('<h1>Servidor PDV no ar!</h1><p>Acesse <a href="/admin">/admin</a> para ver o painel.</p>');
});


// --- Inicia o Servidor ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando em http://localhost:${PORT}`);
  console.log(`👉 Painel de Admin disponível em http://localhost:${PORT}/admin`);
});