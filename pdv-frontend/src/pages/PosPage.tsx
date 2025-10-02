// src/pages/PosPage.tsx
import { useState, useEffect, useRef } from 'react';
import Select from 'react-select';
import toast from 'react-hot-toast';
import { useAuth } from '../services/authService';
// A importação do syncManager é desnecessária e foi REMOVIDA
import { pullProducts, saveAndPushTransaction, pushPendingTransactions } from '../services/syncService';
import { generateReceipt } from '../services/receiptService';
import { db } from '../db/dexie';
import type { Product, TransactionItem } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import apiClient from '../api';
import ProductSelectionModal from '../components/ProductSelectionModal';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

import './PosPage.css';

interface Customer {
  id: string;
  name: string;
  document: string;
}

const PosPage = () => {
  const { user, logout } = useAuth();
  const [cart, setCart] = useState<TransactionItem[]>(() => {
    try {
      const savedCart = localStorage.getItem('currentCart');
      if (!savedCart) return [];
      return JSON.parse(savedCart);
    } catch (error) {
      console.error("Falha ao ler o carrinho do localStorage, iniciando com carrinho vazio.", error);
      localStorage.removeItem('currentCart');
      return [];
    }
  });

  const products = useLiveQuery(() => db.products.toArray(), []);
  
  const [lastItem, setLastItem] = useState<TransactionItem | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);

  const [isLoadingApp, setIsLoadingApp] = useState(true);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerOptions, setCustomerOptions] = useState<{ value: Customer; label: string }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [autoSync, setAutoSync] = useState(true);

  const isOnline = useOnlineStatus();

  const runSilentSync = async () => {
    console.log("Executando sincronização silenciosa em segundo plano...");
    try {
      if(isOnline) {
        await pullProducts();
        await pushPendingTransactions();
      }
    } catch (error) {
      console.error("Falha na sincronização silenciosa:", error);
    }
  };
  
  // CORREÇÃO: Efeito de inicialização simplificado para evitar duplicação e usar o hasInitialized
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initializeApp = async () => {
      setIsLoadingApp(true);
      try {
        await pullProducts();
        if (navigator.onLine) {
          pushPendingTransactions();
        }
        barcodeInputRef.current?.focus();
      } catch (error) {
        console.error("Falha crítica na inicialização:", error);
        toast.error("Não foi possível carregar os dados. Verifique a conexão com o servidor.");
      } finally {
        setIsLoadingApp(false);
      }
    };
    initializeApp();
  }, []);

  // CORREÇÃO: Efeito CENTRALIZADO para reagir à volta da internet
  useEffect(() => {
    if (isOnline) {
      console.log("Conexão reestabelecida. Verificando vendas pendentes...");
      pushPendingTransactions();
    }
  }, [isOnline]);

  useEffect(() => { localStorage.setItem('currentCart', JSON.stringify(cart)); }, [cart]);
  
  useEffect(() => {
    if (!autoSync) return;
    const intervalId = setInterval(runSilentSync, 300000); // 5 minutos
    return () => clearInterval(intervalId);
  }, [autoSync, isOnline]);

  useEffect(() => {
    if (customerSearchInput.length < 2) { setCustomerOptions([]); return; }
    const search = async () => {
      setIsSearchingCustomers(true);
      try {
        const response = await apiClient.get<Customer[]>(`/customers/search?q=${customerSearchInput}`);
        const options = response.data.map(customer => ({ value: customer, label: `${customer.name} - ${customer.document}` }));
        setCustomerOptions(options);
      } catch (error) { console.error("Erro ao buscar clientes", error); }
      finally { setIsSearchingCustomers(false); }
    };
    const debounceTimeout = setTimeout(search, 500);
    return () => clearTimeout(debounceTimeout);
  }, [customerSearchInput]);

  const addToCart = (product: Product) => {
    const newItem: TransactionItem = { productId: product.id, sku: product.sku, name: product.name, unitPrice: product.price, quantity: 1 };
    setLastItem(newItem);
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.productId === product.id);
      if (existingItem) {
        return prevCart.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prevCart, newItem];
    });
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = barcodeInputRef.current?.value;
    if (!barcode) return;
    if (!products) { toast.error("Produtos ainda não carregados."); return; }
    const product = products.find(p => p.sku === barcode.toUpperCase());
    if (product) {
      addToCart(product);
    } else {
      toast.error(`Produto com código "${barcode}" não encontrado.`);
    }
    barcodeInputRef.current!.value = '';
  };

  const calculateTotal = () => cart.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const clearCart = () => { setCart([]); setLastItem(null); setSelectedCustomer(null); };

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    try {
      await pullProducts();
      await pushPendingTransactions(true);
      setSyncStatus('success');
    } catch (error) {
      setSyncStatus('error');
    } finally {
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  const handleCheckout = async () => {
    if (!user) { toast.error("Operador não identificado."); return; }
    if (cart.length === 0) { toast.error("O carrinho está vazio!"); return; }
    try {
      const savedTransaction = await saveAndPushTransaction(cart, user);
      generateReceipt(
        savedTransaction.items,
        savedTransaction.totalCents,
        user,
        savedTransaction.clientTransactionId
      );
      clearCart();
    } catch (error) {
      toast.error('Erro grave ao registrar a venda.');
    }
  };

  if (isLoadingApp) {
    return (
      <div className="loading-container">
        <h1>Carregando Sistema do PDV...</h1>
        <p>Sincronizando dados com o servidor.</p>
      </div>
    );
  }

  return (
    <>
      {isProductModalOpen && (
        <ProductSelectionModal 
          onClose={() => setIsProductModalOpen(false)}
          onProductSelect={addToCart}
        />
      )}
      <div className="pdv-container">
        <header className="pdv-main-header">
          <div className={`network-status ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? '● Online' : '● Offline'}
          </div>
          PASSE O ITEM PELO LEITOR
        </header>
        <main className="pdv-main-content">
          <section className="sale-info-panel-left">
            <div className='customer-search-container'>
              <label>CLIENTE</label>
              <Select
                placeholder="Pesquisar cliente..."
                options={customerOptions}
                onInputChange={(value) => setCustomerSearchInput(value)}
                onChange={(option) => setSelectedCustomer(option?.value || null)}
                isLoading={isSearchingCustomers}
                value={selectedCustomer ? { value: selectedCustomer, label: `${selectedCustomer.name} - ${selectedCustomer.document}` } : null}
                isClearable
              />
            </div>
            <h3>Seus Itens</h3>
            <div className="items-list-box">
              {cart.length === 0 ? (
                <p className="empty-cart-message">O carrinho está vazio.</p>
              ) : (
                <table>
                  <thead><tr><th>Produto</th><th>Qtd</th><th>Total</th></tr></thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.productId}><td>{item.name}</td><td>{item.quantity}</td><td>R$ {((item.unitPrice * item.quantity)/100).toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="sale-total">
              <span>Total:</span>
              <span>R$ {(calculateTotal() / 100).toFixed(2)}</span>
            </div>
          </section>
          
          <section className="product-details-panel-right">
            <div className="product-image-placeholder">
              {lastItem ? <><h3>{lastItem.name}</h3><p className="last-item-price">R$ {(lastItem.unitPrice / 100).toFixed(2)}</p></> : <p>Aguardando item...</p>}
            </div>
            <form onSubmit={handleBarcodeSubmit}>
              <label htmlFor="barcode-input">Código de Barras</label>
              <input id="barcode-input" ref={barcodeInputRef} type="text" placeholder="Digite o SKU e pressione Enter" />
            </form>
          </section>
        </main>
        <footer className="pdv-footer">
          <button className="footer-button cancel" onClick={clearCart}>CANCELAR VENDA</button>
          <button className="footer-button category" onClick={() => setIsProductModalOpen(true)}>
            PRODUTOS
          </button>
          <button className={`footer-button action sync-${syncStatus}`} onClick={handleManualSync} disabled={syncStatus === 'syncing'}>
            {syncStatus === 'syncing' && 'SINCRONIZANDO...'}
            {syncStatus === 'idle' && 'SINCRONIZAR'}
            {syncStatus === 'success' && 'SUCESSO!'}
            {syncStatus === 'error' && 'ERRO!'}
          </button>
          <div className="auto-sync-toggle">
            <input type="checkbox" id="auto-sync" checked={autoSync} onChange={() => setAutoSync(!autoSync)} />
            <label htmlFor="auto-sync">Sinc. Automática</label>
          </div>
          <button className="footer-button confirm" onClick={handleCheckout} disabled={cart.length === 0}>FINALIZAR COMPRA</button>
        </footer>
      </div>
    </>
  );
};

export default PosPage;