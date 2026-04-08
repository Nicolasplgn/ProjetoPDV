// src/main.tsx

import ReactDOM from 'react-dom/client';
// 1. ALTERAÇÃO AQUI: Importamos o HashRouter em vez do BrowserRouter
import { HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // 2. ALTERAÇÃO AQUI: Usamos o componente HashRouter
  <HashRouter>
    <App />
  </HashRouter>
)