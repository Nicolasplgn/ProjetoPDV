// src/pages/PosPage.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Select, { type SingleValue, type SelectInstance } from 'react-select';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import {
  FaBoxOpen, FaBarcode, FaSync, FaSignOutAlt,
  FaUserCircle, FaQuestionCircle, FaList, FaCheck, FaSearch, FaStore, FaIdCard, FaCamera
} from 'react-icons/fa';

import { runInitialSync, saveAndPushTransaction, pushPendingTransactions } from '../services/syncService';
import { db } from '../db/dexie';
import type { Customer, Product, TabelaPreco, TransactionItem, Filial, PdvSetting } from '../types';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { checkRealInternet } from '../utils/network';
import { generateReceipt } from '../services/receiptService';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../services/authService';

import ProductSelectionModal from '../components/ProductSelectionModal';
import ShortcutsModal from '../components/ShortcutsModal';
import CheckoutModal from '../components/CheckoutModal';
import QuantityModal from '../components/QuantityModal';
import CpfModal from '../components/CpfModal';
import { BarcodeScanner } from '../components/BarcodeScanner';

import './PosPage.css';

// ============================================================================
// INTELIGÊNCIA DE NEGÓCIO: REGRA DE PROMOÇÃO
// Retorna sempre o preço final correto em centavos e o estado da promoção.
// Nunca lança exceção — em caso de dado inválido retorna o preço normal.
// ============================================================================
export const checkActivePromotion = (
  product: Product
): { isActive: boolean; price: number; message: string } => {
  const fallback = { isActive: false, price: product.price, message: '' };

  // 1. Produto não tem preço promocional configurado
  if (!product.preco_promocao || product.preco_promocao <= 0) return fallback;

  // 2. Sem data de validade = promoção por tempo indeterminado
  if (!product.validade_promocao || product.validade_promocao.trim() === '') {
    return {
      isActive: true,
      price:    product.preco_promocao,
      message:  'Promoção ativa por tempo indeterminado!',
    };
  }

  // 3. Normaliza a data de validade (suporta "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss" e "YYYY-MM-DD HH:mm:ss")
  const validade = product.validade_promocao.includes('T')
    ? product.validade_promocao.split('T')[0]
    : product.validade_promocao.split(' ')[0];

  // 4. Data de hoje no fuso local, sem depender de new Date(string) que interpreta como UTC
  const hojeObj = new Date();
  const hoje =[
    hojeObj.getFullYear(),
    String(hojeObj.getMonth() + 1).padStart(2, '0'),
    String(hojeObj.getDate()).padStart(2, '0'),
  ].join('-');

  // 5. Comparação lexicográfica de strings ISO (funciona porque o formato é YYYY-MM-DD)
  if (hoje <= validade) {
    const [year, month, day] = validade.split('-');
    return {
      isActive: true,
      price:    product.preco_promocao,
      message:  `Promoção válida até ${day}/${month}/${year}!`,
    };
  }

  // 6. Promoção expirada
  return fallback;
};

// ============================================================================
// HOOK AUXILIAR: valor anterior de um estado (para detectar mudança de tabela)
// ============================================================================
function usePrevious<T>(value: T) {
  const ref = useRef<T>(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

// ============================================================================
// HELPER: lê o pointDescription do localStorage de forma síncrona.
// Usado na inicialização do estado para evitar o flash de valor vazio.
// ============================================================================
const readPointDescriptionFromStorage = (): string => {
  try {
    const saved = localStorage.getItem('pdv_active_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed?.descricao || '';
    }
  } catch (_) { /* silencioso */ }
  return '';
};

const PosPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOnline = useNetworkStatus();

  // ============================================================================
  // 1. ESTADOS (STATE MANAGEMENT)
  // ============================================================================

  // --- Controle de Mobile UX ---
  const[isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isMobileUserOpen, setIsMobileUserOpen] = useState(false);

  // --- Carrinho e Totais ---
  const [cart, setCart] = useState<TransactionItem[]>(() => {
    const saved = localStorage.getItem('pdv_cart');
    return saved ? JSON.parse(saved) :[];
  });
  const [totalCents, setTotalCents] = useState(0);

  // --- Seleções de Cabeçalho (Persistentes) ---
  const [selectedUnidade, setSelectedUnidade] = useState<Filial | null>(() => {
    const saved = localStorage.getItem('pdv_unidade');
    return saved ? JSON.parse(saved) : null;
  });

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    const saved = localStorage.getItem('pdv_customer');
    return saved ? JSON.parse(saved) : null;
  });

  const [selectedPriceTable, setSelectedPriceTable] = useState<TabelaPreco | null>(() => {
    const saved = localStorage.getItem('pdv_price_table');
    return saved ? JSON.parse(saved) : null;
  });

  // --- Configurações do Ponto de Venda (Travamento) ---
  const [pointDescription, setPointDescription] = useState<string>(readPointDescriptionFromStorage);
  const [isUnidadeLocked, setIsUnidadeLocked]   = useState(false);
  const [isTableLocked, setIsTableLocked]       = useState(false);
  const[isCustomerLocked, setIsCustomerLocked] = useState(false);
  const [lockedFinalidade, setLockedFinalidade] = useState<string | null>(null);

  // --- Série padrão do PDV (para pré-selecionar no checkout) ---
  const [pdvSerieId, setPdvSerieId] = useState<number | undefined>(undefined);

  // --- Confirmação de Troca de Tabela ---
  const[isTableConfirmOpen, setIsTableConfirmOpen] = useState(false);
  const [pendingPriceTable, setPendingPriceTable]   = useState<TabelaPreco | null>(null);

  // --- Inputs do Item Atual (Esquerda) ---
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const[itemQty, setItemQty]                 = useState(1);
  const [itemPrice, setItemPrice]             = useState(0);
  const [itemDiscount, setItemDiscount]       = useState(0);
  const[itemTotal, setItemTotal]             = useState(0);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');

  // --- CPF na Nota (somente faturamento) ---
  const [cpfNota, setCpfNota]               = useState('');
  const [isCpfModalOpen, setIsCpfModalOpen] = useState(false);
  const isFaturamentoMode = lockedFinalidade === 'faturamento';

  // --- Controle de UI e Modais ---
  const [isLoading, setIsLoading]                       = useState(true);
  const[isManualSyncing, setIsManualSyncing]           = useState(false);
  const[isProcessingSale, setIsProcessingSale]         = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen]   = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen]     = useState(false);
  const[isQuantityModalOpen, setIsQuantityModalOpen]   = useState(false);
  const [isScannerOpen, setIsScannerOpen]               = useState(false);

  // ============================================================================
  // 2. REFERÊNCIAS (REFS)
  // ============================================================================
  const customerSelectRef   = useRef<SelectInstance<any>>(null);
  const productSelectRef    = useRef<SelectInstance<any>>(null);
  const unidadeSelectRef    = useRef<SelectInstance<any>>(null);
  const priceTableSelectRef = useRef<SelectInstance<any>>(null);

  const qtyInputRef         = useRef<HTMLInputElement>(null);
  const discountInputRef    = useRef<HTMLInputElement>(null);
  const registerButtonRef   = useRef<HTMLButtonElement>(null);
  const quickSearchInputRef = useRef<HTMLInputElement>(null);

  const endOfCartRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // 3. DADOS DO BANCO (DEXIE LIVE QUERY)
  // ============================================================================
  const customers       = useLiveQuery(() => db.customers.toArray(),      []) ||[];
  const unidades        = useLiveQuery(() => db.filiais.toArray(),         []) ||[];
  const priceTables     = useLiveQuery(() => db.priceTables.toArray(),     []) ||[];
  const formasPagamento = useLiveQuery(() => db.formasPagamento.toArray(), []) ||[];
  const prazosPagamento = useLiveQuery(() => db.prazosPagamento.toArray(), []) ||[];

  const availableProducts = useLiveQuery(
    () => selectedPriceTable
      ? db.products.where('produto_tabela_id').equals(selectedPriceTable.id).toArray()
      :[],
    [selectedPriceTable]
  ) ||[];

  const prevPriceTable = usePrevious(selectedPriceTable);
  const isReadyToSale  = !!(selectedCustomer && selectedUnidade && selectedPriceTable);

  // ============================================================================
  // 4. EFEITOS (USE EFFECT)
  // ============================================================================

  // --- Carregar Configurações do Ponto (Vínculo) ---
  useEffect(() => {
    const applyPdvSettings = async () => {
      if (!user) return;

      let settingsStr  = localStorage.getItem('pdv_active_settings');
      let pdvSettings: PdvSetting | null = settingsStr ? JSON.parse(settingsStr) : null;

      if (!pdvSettings && user.pessoa_id) {
        const found = await db.pdvSettings
          .where('pessoa_operador_id')
          .equals(user.pessoa_id)
          .first();
        if (found) pdvSettings = found;
      }

      if (pdvSettings) {
        console.log('🔒 Aplicando configurações do Ponto de Venda:', pdvSettings);
        setPointDescription(pdvSettings.descricao);

        if (pdvSettings.pessoa_unidade_id) {
          const unidade = await db.filiais.get(pdvSettings.pessoa_unidade_id.toString());
          if (unidade) {
            setSelectedUnidade(unidade);
            setIsUnidadeLocked(true);
          }
        }

        if (pdvSettings.produto_tabela_id) {
          const tabela = await db.priceTables.get(pdvSettings.produto_tabela_id.toString());
          if (tabela) {
            setSelectedPriceTable(tabela);
            setIsTableLocked(true);
          }
        }

        if (pdvSettings.pessoa_cliente_id) {
          const cliente = await db.customers.get(pdvSettings.pessoa_cliente_id.toString());
          if (cliente) {
            setSelectedCustomer(cliente);
            setIsCustomerLocked(true);
          }
        }

        setLockedFinalidade(pdvSettings.finalidade || null);
        setPdvSerieId(pdvSettings.fatur_serie_id ? Number(pdvSettings.fatur_serie_id) : undefined);

      } else {
        setIsUnidadeLocked(false);
        setIsTableLocked(false);
        setIsCustomerLocked(false);
        setLockedFinalidade(null);
        setPointDescription('');
        setPdvSerieId(undefined);
      }
    };

    applyPdvSettings();
  }, [user]);

  // --- Persistência do Estado ---
  useEffect(() => {
    localStorage.setItem('pdv_cart',        JSON.stringify(cart));
    localStorage.setItem('pdv_unidade',     JSON.stringify(selectedUnidade));
    localStorage.setItem('pdv_customer',    JSON.stringify(selectedCustomer));
    localStorage.setItem('pdv_price_table', JSON.stringify(selectedPriceTable));
  },[cart, selectedUnidade, selectedCustomer, selectedPriceTable]);

  // --- Recalcular Preços ao Trocar Tabela ---
  useEffect(() => {
    if (
      prevPriceTable &&
      selectedPriceTable &&
      prevPriceTable.id !== selectedPriceTable.id &&
      cart.length > 0
    ) {
      const updateCartPrices = async () => {
        const newCart: TransactionItem[] = [];
        const removedItems: string[]     =[];

        for (const item of cart) {
          const newProductData = await db.products
            .where({ id: item.productId, produto_tabela_id: selectedPriceTable.id })
            .first();

          if (newProductData) {
            const promo = checkActivePromotion(newProductData);
            newCart.push({
              ...item,
              unitPrice: promo.price,
              desconto:  newProductData.desconto,
            });
          } else {
            removedItems.push(item.name);
          }
        }
        setCart(newCart);
        if (removedItems.length > 0) {
          toast.error(`Itens removidos (sem preço na nova tabela): ${removedItems.join(', ')}`);
        } else {
          toast.success('Preços atualizados para a nova tabela!');
        }
      };
      updateCartPrices();
    }
  }, [selectedPriceTable, cart, prevPriceTable]);

  // --- Atualizar Totais ---
  useEffect(() => {
    const newTotal = cart.reduce(
      (acc, item) => acc + (item.unitPrice - item.desconto) * item.quantity,
      0
    );
    setTotalCents(newTotal);
  }, [cart]);

  // --- Scroll Automático no Recibo ---
  useEffect(() => {
    if (endOfCartRef.current) {
      endOfCartRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [cart, isMobileCartOpen]);

  // --- Calcular Total do Item em Edição ---
  useEffect(() => {
    setItemTotal((itemPrice - itemDiscount) * itemQty);
  },[itemQty, itemPrice, itemDiscount]);

  // --- Inicialização ---
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      if ((await db.customers.count()) === 0) {
        const online = await checkRealInternet();
        if (online) {
          await toast.promise(runInitialSync(), {
            loading: 'Sincronizando dados iniciais...',
            success: 'Dados sincronizados!',
            error:   'Falha na sincronização inicial.',
          });
        }
      }
      setIsLoading(false);
    };
    initialize();
  }, [user]);

  // ============================================================================
  // 5. HANDLERS (FUNÇÕES DE AÇÃO)
  // ============================================================================

  const clearCurrentSaleData = () => {
    localStorage.removeItem('pdv_cart');
    if (!isCustomerLocked) {
      localStorage.removeItem('pdv_customer');
      setSelectedCustomer(null);
    }
    setCart([]);
    setCpfNota('');
    setIsMobileCartOpen(false);
  };

  const updateCartQuantity = useCallback((productId: string, change: number) => {
    setCart(prev => {
      const itemIndex   = prev.findIndex(item => item.productId === productId);
      const updatedCart = [...prev];

      if (itemIndex > -1) {
        const newQuantity = updatedCart[itemIndex].quantity + change;
        if (newQuantity <= 0) {
          updatedCart.splice(itemIndex, 1);
        } else {
          updatedCart[itemIndex] = { ...updatedCart[itemIndex], quantity: newQuantity };
        }
        return updatedCart;
      }

      return prev;
    });

    if (change > 0) {
      setCart(prev => {
        const alreadyExists = prev.some(item => item.productId === productId);
        if (alreadyExists) return prev;

        const productToAdd = availableProducts?.find(p => p.id === productId);
        if (!productToAdd) return prev;

        const promo = checkActivePromotion(productToAdd);

        const newItem: TransactionItem = {
          productId:                  productToAdd.id,
          sku:                        productToAdd.sku,
          name:                       productToAdd.name,
          unitPrice:                  promo.price,
          quantity:                   change,
          desconto:                   productToAdd.desconto,
          produto_unidade_id:         productToAdd.produto_unidade_id,
          tributo_tab_classfiscal_id: productToAdd.tributo_tab_classfiscal_id,
          custo_venda:                productToAdd.custo_venda,
        };
        return[...prev, newItem];
      });
    }
  }, [availableProducts]);

  // ============================================================================
  // O PULO DO GATO: BUSCA COM INTELIGÊNCIA DE DÍGITO VERIFICADOR
  // ============================================================================
  const quickAddItem = useCallback((term: string) => {
    if (!term.trim() || !availableProducts) return;
    const searchTerm = term.trim().toLowerCase();

    // 1. Tira os zeros à esquerda (ex: "00000698" vira "698")
    const searchSemZeros = searchTerm.replace(/^0+/, '');

    // 2. Tira o dígito verificador (último número) da impressora e os zeros!
    let searchSemDigitoVerificador = '';
    // Só fazemos a mágica do dígito verificador se for numérico e grande (etiqueta)
    if (/^\d+$/.test(searchTerm) && searchTerm.length >= 8) {
      searchSemDigitoVerificador = searchTerm.slice(0, -1).replace(/^0+/, '');
    }

    // Camada 1: Busca EXATA no banco
    let foundProduct = availableProducts.find(p => 
      p.sku?.toLowerCase() === searchTerm || p.id.toString() === searchTerm
    );

    // Camada 2: Busca IGNORANDO zeros
    if (!foundProduct && searchSemZeros) {
      foundProduct = availableProducts.find(p => 
        p.id.toString() === searchSemZeros || p.sku?.toLowerCase() === searchSemZeros
      );
    }

    // Camada 3: Busca IGNORANDO o dígito verificador + zeros
    if (!foundProduct && searchSemDigitoVerificador) {
      foundProduct = availableProducts.find(p => 
        p.id.toString() === searchSemDigitoVerificador
      );
    }

    if (foundProduct) {
      updateCartQuantity(foundProduct.id, itemQty);

      const promo = checkActivePromotion(foundProduct);
      if (promo.isActive) {
        toast.success(
          `${foundProduct.name} (${itemQty}x) adicionado.\n🏷️ ${promo.message}`,
          {
            duration: 4000,
            style: { border: '1px solid #28a745', color: '#155724', backgroundColor: '#d4edda' },
          }
        );
      } else {
        toast.success(`${foundProduct.name} adicionado (${itemQty}x).`);
      }

      setQuickSearchTerm('');
      setItemQty(1);
    } else {
      toast.error(`Código não encontrado: ${term}`);
      setQuickSearchTerm('');
    }
  },[availableProducts, itemQty, updateCartQuantity]);

  useEffect(() => {
    if (!quickSearchTerm) return;
    const debounceTimer = setTimeout(() => quickAddItem(quickSearchTerm), 400);
    return () => clearTimeout(debounceTimer);
  },[quickSearchTerm, quickAddItem]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Ignora todos os atalhos se a venda estiver sendo processada
      if (isProcessingSale) return;

      if (
        isCheckoutModalOpen  ||
        isShortcutsModalOpen ||
        isProductModalOpen   ||
        isTableConfirmOpen   ||
        isQuantityModalOpen  ||
        isCpfModalOpen       ||
        isScannerOpen
      ) {
        if (event.key === 'Escape') {
          setIsCheckoutModalOpen(false);
          setIsShortcutsModalOpen(false);
          setIsProductModalOpen(false);
          setIsTableConfirmOpen(false);
          setIsQuantityModalOpen(false);
          setIsCpfModalOpen(false);
          setIsScannerOpen(false);
        }
        return;
      }

      if (event.key === 'Enter') {
        const active = document.activeElement;

        if (active === customerSelectRef.current?.inputRef) {
          if (!isUnidadeLocked) unidadeSelectRef.current?.focus();
          else if (!isTableLocked) priceTableSelectRef.current?.focus();
          else quickSearchInputRef.current?.focus();
        } else if (active === unidadeSelectRef.current?.inputRef) {
          if (!isTableLocked) priceTableSelectRef.current?.focus();
          else quickSearchInputRef.current?.focus();
        } else if (active === priceTableSelectRef.current?.inputRef) {
          quickSearchInputRef.current?.focus();
        } else if (active === quickSearchInputRef.current) {
          productSelectRef.current?.focus();
        } else if (active === productSelectRef.current?.inputRef) {
          qtyInputRef.current?.focus();
        } else if (active === qtyInputRef.current) {
          discountInputRef.current?.focus();
        } else if (active === discountInputRef.current) {
          registerButtonRef.current?.focus();
        }
      }

      switch (event.key) {
        case 'F1': event.preventDefault(); setIsShortcutsModalOpen(true); break;
        case 'F2': event.preventDefault(); productSelectRef.current?.focus(); break;
        case 'F3':
          event.preventDefault();
          if (!isCustomerLocked) customerSelectRef.current?.focus();
          break;
        case 'F4':
          event.preventDefault();
          if (!isUnidadeLocked) unidadeSelectRef.current?.focus();
          break;
        case 'F5':
          event.preventDefault();
          if (!isTableLocked) priceTableSelectRef.current?.focus();
          break;
        case 'F6': event.preventDefault(); quickSearchInputRef.current?.focus(); break;
        case 'F7': event.preventDefault(); setIsQuantityModalOpen(true); break;
        case 'F8':
          event.preventDefault();
          if (cart.length > 0) setIsCheckoutModalOpen(true);
          else toast.error('Carrinho vazio!');
          break;
        case 'F9':
          event.preventDefault();
          if (isFaturamentoMode) setIsCpfModalOpen(true);
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  },[
    isCheckoutModalOpen, isShortcutsModalOpen, isProductModalOpen,
    isTableConfirmOpen,  isQuantityModalOpen,  isCpfModalOpen, isScannerOpen,
    cart, isUnidadeLocked, isTableLocked, isCustomerLocked, isFaturamentoMode,
    isProcessingSale
  ]);

  const handleQuantityConfirm = (qty: number) => {
    setItemQty(qty);
    setIsQuantityModalOpen(false);
    toast.success(`Multiplicador definido: ${qty}x`);
    setTimeout(() => quickSearchInputRef.current?.focus(), 100);
  };

  const handleProductSelect = (product: Product | null) => {
    setSelectedProduct(product);
    if (product) {
      const promoInfo = checkActivePromotion(product);
      setItemPrice(promoInfo.price);
      setItemDiscount(product.desconto || 0);

      if (promoInfo.isActive) {
        toast.success(`🏷️ ${promoInfo.message}`, {
          duration: 4000,
          style: { border: '1px solid #28a745', color: '#155724', backgroundColor: '#d4edda' },
        });
      }

      setTimeout(() => qtyInputRef.current?.select(), 100);
    } else {
      setItemPrice(0);
      setItemDiscount(0);
      setItemQty(1);
    }
  };

  const handleAddItemToCart = () => {
    if (!selectedProduct) {
      toast.error('Selecione um produto.'); return;
    }
    if (itemQty <= 0) {
      toast.error('Quantidade inválida.'); return;
    }
    if (itemDiscount >= itemPrice) {
      toast.error('Desconto inválido.');
      discountInputRef.current?.focus();
      return;
    }

    const newItem: TransactionItem = {
      productId:                  selectedProduct.id,
      sku:                        selectedProduct.sku,
      name:                       selectedProduct.name,
      unitPrice:                  itemPrice,
      quantity:                   itemQty,
      desconto:                   itemDiscount,
      produto_unidade_id:         selectedProduct.produto_unidade_id,
      tributo_tab_classfiscal_id: selectedProduct.tributo_tab_classfiscal_id,
      custo_venda:                selectedProduct.custo_venda,
    };

    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.productId === selectedProduct.id);
      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + itemQty }
            : item
        );
      }
      return [...prev, newItem];
    });

    handleProductSelect(null);
    setItemQty(1);
    productSelectRef.current?.focus();
  };

  const handleConfirmCheckout = async (
    finalidade: string,
    formaId: string,
    prazoId: string,
    faturSerieId?: number
  ) => {
    setIsCheckoutModalOpen(false);

    if (!selectedUnidade || !selectedCustomer || !selectedPriceTable || !user) {
      toast.error('Dados incompletos.'); return;
    }

    const formaPgtoObj = await db.formasPagamento.get(formaId);
    const prazoPgtoObj = await db.prazosPagamento.get(prazoId);

    if (!formaPgtoObj || !prazoPgtoObj) {
      toast.error('Erro no pagamento.'); return;
    }

    const finalFinalidade = lockedFinalidade || finalidade;

    // --- Inicia bloqueio da tela ---
    setIsProcessingSale(true);

    try {
      const savedTransaction = await saveAndPushTransaction(
        cart,
        selectedCustomer,
        selectedUnidade,
        selectedPriceTable,
        formaPgtoObj,
        prazoPgtoObj,
        finalFinalidade,
        user,
        totalCents,
        cpfNota,
        faturSerieId
      );

      await generateReceipt(savedTransaction, user.descricao);
      clearCurrentSaleData();

    } catch (error) {
      toast.error(`Falha ao salvar: ${String(error)}`);
    } finally {
      // --- Libera o bloqueio da tela independente de sucesso ou falha ---
      setIsProcessingSale(false);
    }
  };

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      const reallyOnline = await checkRealInternet();
      if (!reallyOnline) {
        toast.error('Sem conexão com a internet. Verifique sua rede.');
        return;
      }
      if (user) await runInitialSync();
      await pushPendingTransactions(true);

    } catch (err) {
      console.error('[handleManualSync] Erro:', err);
      toast.error('Erro durante a sincronização.');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Saiu com sucesso!');
  };

  const handlePriceTableChangeAttempt = (newTable: TabelaPreco | null) => {
    if (cart.length === 0) {
      setSelectedPriceTable(newTable); return;
    }
    if (newTable?.id === selectedPriceTable?.id) return;
    setPendingPriceTable(newTable);
    setIsTableConfirmOpen(true);
  };

  const confirmPriceTableChange = () => {
    setSelectedPriceTable(pendingPriceTable);
    setPendingPriceTable(null);
    setIsTableConfirmOpen(false);
  };

  const cancelPriceTableChange = () => {
    setPendingPriceTable(null);
    setIsTableConfirmOpen(false);
  };

  const handleCpfConfirm = (cpf: string) => {
    setCpfNota(cpf);
    setIsCpfModalOpen(false);
    if (cpf) {
      toast.success(`CPF informado: ${cpf}`);
    } else {
      toast.success('CPF removido da nota.');
    }
  };

  // ============================================================================
  // 6. OPÇÕES PARA SELECTS
  // ============================================================================
  const customerOptions = customers.map(c => ({
    value: c,
    label: c.fantasia
      ? `${c.id} - ${c.name} - ${c.fantasia}`
      : `${c.id} - ${c.name}`,
  }));

  const productOptions = availableProducts.map(p => ({
    value: p,
    label: `${p.id} - ${p.name} (${p.sku})`,
  }));

  const unidadeOptions = unidades.map(u => ({
    value: u,
    label: u.nome_fantasia
      ? `${u.descricao} - ${u.nome_fantasia}`
      : u.descricao,
  }));

  const priceTableOptions = priceTables.map(pt => ({
    value: pt,
    label: pt.descricao,
  }));

  const selectedProductPromo = selectedProduct
    ? checkActivePromotion(selectedProduct)
    : null;

  if (isLoading) {
    return <div className="loading-container"><h1>Carregando PDV...</h1></div>;
  }

  // ============================================================================
  // 7. RENDERIZAÇÃO
  // ============================================================================
  return (
    <div className={`pdv-container ${isMobileCartOpen ? 'mobile-cart-open' : ''}`}>

      <style>{`
        /* ================================================================
           BASE (DESKTOP)
        ================================================================ */
        .mobile-bottom-bar,
        .mobile-cart-app-bar {
          display: none !important;
        }

        input, select, textarea { font-size: 16px !important; }

        .promo-active-input {
          color: #155724 !important;
          background-color: #d4edda !important;
          border-color: #c3e6cb !important;
          font-weight: bold;
        }

        /* ================================================================
           MOBILE (≤ 992px) - OTIMIZADO E COMPACTO
        ================================================================ */
        @media (max-width: 992px) {
          html, body, #root {
            height: 100%;
            width: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }

          .pdv-container {
            display: flex;
            flex-direction: column;
            height: 100vh !important;
            height: 100dvh !important;
            overflow: hidden;
            background: #f4f6f8;
            position: relative;
          }

          /* Cabeçalho mais compacto */
          .pdv-main-header {
            padding: 8px 10px !important;
            gap: 5px !important;
            flex-wrap: wrap !important;
            min-height: 50px !important;
            height: auto !important;
            justify-content: space-between;
          }
          .header-left-group, .header-right-group { gap: 5px !important; flex-wrap: wrap; }
          .brand-title { font-size: 1.1rem !important; }
          .header-btn { padding: 6px 10px !important; font-size: 0.9rem !important; }
          
          .header-btn span { display: none !important; }
          .user-name.mobile-hide { display: none !important; }
          
          .mobile-compact-badge { margin-left: 0 !important; padding: 4px 6px !important; font-size: 0.75rem !important; }
          .mobile-compact-badge span.mobile-hide { display: none !important; }

          /* Layout Principal */
          .pdv-split-layout { 
            flex: 1; 
            display: flex; 
            flex-direction: column !important; 
            overflow: hidden; 
            position: relative;
          }

          .product-image-placeholder { display: none !important; }
          
          /* Painel de Rolagem */
          .left-panel {
            width: 100% !important;
            flex: 1;
            height: 100% !important;
            overflow-y: auto !important;
            padding: 10px 10px 80px 10px !important; /* Espaço pro carrinho respirar */
          }

          /* Banner Caixa Livre reduzido */
          .product-display-banner { padding: 8px !important; min-height: auto !important; margin-bottom: 10px !important; }
          .product-display-banner h2 { font-size: 1.1rem !important; margin-bottom: 2px !important; }
          .sku-display { font-size: 0.8rem !important; }

          /* Inputs mais compactos para caber mais na tela */
          .input-row-split {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px !important;
            margin-bottom: 8px !important;
          }
          .input-group-vertical { margin-bottom: 6px !important; }
          .input-group-vertical label { font-size: 0.75rem !important; white-space: nowrap; }
          .big-input, .big-number-input { height: 40px !important; font-size: 1rem !important; }
          .lcd-display { font-size: 1.3rem !important; height: 40px !important; line-height: 40px !important; }
          
          /* Botão Registrar com formato melhorado e espaçamento pra não encostar na barra */
          .action-btn-register { 
            padding: 12px !important; 
            font-size: 1.1rem !important; 
            margin-top: 8px; 
            margin-bottom: 20px;
            border-radius: 6px;
          }

          /* ====================================================
             BARRA INFERIOR DE CARRINHO BLINDADA
             Movida pra fora do fluxo de scroll
          ==================================================== */
          .mobile-bottom-bar {
            display: flex !important;
            position: fixed !important;
            bottom: 0 !important; 
            left: 0 !important; 
            right: 0 !important; 
            width: 100% !important;
            background: #005A8D !important;
            color: white !important;
            padding: 12px 15px !important;
            justify-content: space-between !important;
            align-items: center !important;
            z-index: 9999 !important; /* Acima de tudo! */
            box-shadow: 0 -4px 15px rgba(0,0,0,0.2) !important;
            border-top-left-radius: 12px !important;
            border-top-right-radius: 12px !important;
          }
          .mobile-bottom-bar .total-text { 
            font-size: 1.2rem !important; 
            font-weight: bold !important; 
          }
          .mobile-bottom-bar button {
            background: #28a745 !important; 
            color: white !important; 
            border: none !important;
            padding: 8px 16px !important; 
            border-radius: 8px !important; 
            font-size: 1rem !important; 
            font-weight: bold !important; 
            cursor: pointer !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
          }

          /* Oculta a barra inferior se o carrinho estiver aberto para a tela toda */
          .mobile-cart-open .mobile-bottom-bar {
            display: none !important;
          }

          .right-panel { display: none !important; }
          .pdv-footer  { display: none !important; }

          /* TELA DO CARRINHO ABERTO (MOBILE) */
          .mobile-cart-open .mobile-cart-app-bar {
            display: flex !important;
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 65px;
            background: #005A8D;
            color: white;
            align-items: center;
            justify-content: space-between;
            padding: 0 15px;
            z-index: 10005;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          }
          .mobile-cart-app-bar .back-btn {
            background: #dc3545; color: white; border: none;
            padding: 10px 15px; border-radius: 6px;
            font-weight: bold; font-size: 1rem; cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          .mobile-cart-app-bar .pdv-name {
            font-size: 0.9rem; font-weight: bold;
            text-align: right; max-width: 60%; line-height: 1.2; opacity: 0.9;
          }

          .mobile-cart-open .right-panel {
            display: flex !important;
            position: fixed !important;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100% !important; height: 100vh !important; height: 100dvh !important;
            z-index: 9999;
            background: #f4f6f8;
            flex-direction: column;
            padding: 75px 10px 10px 10px !important;
          }
          .mobile-cart-open .receipt-paper {
            flex: 1;
            overflow-y: auto;
            margin-top: 10px;
          }
          .mobile-cart-open .pdv-footer {
            display: flex !important;
            position: static !important;
            flex-wrap: wrap;
            padding: 10px 0 0 0;
            background: transparent;
            border: none;
          }
          .mobile-cart-open .pdv-footer .footer-button {
            flex: 1 1 45%;
            margin: 4px;
            padding: 12px !important;
            font-size: 0.85rem !important;
          }
        }
      `}</style>

      <div className="mobile-cart-app-bar">
        <button className="back-btn" onClick={() => setIsMobileCartOpen(false)}>
          &larr; VOLTAR
        </button>
        <span className="pdv-name">
          {pointDescription ? pointDescription.toUpperCase() : 'PDV PRINCIPAL'}
        </span>
      </div>

      <header className="pdv-main-header">
        <div className="header-left-group">
          <div className={`network-status ${isOnline ? 'online' : 'offline'}`}>
            <span className="mobile-hide">{isOnline ? '● On' : '● Off'}</span>
          </div>
          <span className="brand-title">WAVE PDV</span>

          {pointDescription && (
            <div
              className="mobile-compact-badge"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: 'rgba(255,255,255,0.15)', padding: '4px 12px',
                borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                marginLeft: '15px', fontSize: '0.9rem', fontWeight: 'bold',
              }}
            >
              <FaStore />
              <span className="mobile-hide">{pointDescription.toUpperCase()}</span>
            </div>
          )}

          {isFaturamentoMode && (
            <div
              className="mobile-compact-badge"
              onClick={() => setIsCpfModalOpen(true)}
              title="CPF na Nota (F9)"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: cpfNota ? 'rgba(0,200,100,0.25)' : 'rgba(255,255,255,0.1)',
                padding: '4px 12px',
                borderRadius: '4px',
                border: `1px solid ${cpfNota ? 'rgba(0,200,100,0.5)' : 'rgba(255,255,255,0.2)'}`,
                marginLeft: '10px', fontSize: '0.85rem', fontWeight: 'bold',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <FaIdCard />
              <span className="mobile-hide">{cpfNota ? `CPF: ${cpfNota}` : 'CPF (F9)'}</span>
            </div>
          )}
        </div>

        <div className="header-right-group">
          <button
            className="header-btn header-sync-btn"
            onClick={handleManualSync}
            disabled={isManualSyncing || !isOnline}
            title="Sincronizar"
          >
            <FaSync className={isManualSyncing ? 'spin-icon' : ''} />
            <span className="mobile-hide">{isManualSyncing ? ' Sinc...' : ' Sincronizar'}</span>
          </button>

          {user && (
            <div 
              className="header-user-info"
              onClick={() => setIsMobileUserOpen(!isMobileUserOpen)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                backgroundColor: isMobileUserOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', 
                padding: '6px 10px', borderRadius: '6px',
                transition: 'background-color 0.2s', border: '1px solid rgba(255,255,255,0.1)'
              }}
              title="Tocar para exibir operador"
            >
              <FaUserCircle size={20} />
              <span 
                className={`user-name ${!isMobileUserOpen ? 'mobile-hide' : ''}`} 
                style={{ fontSize: '0.95rem', fontWeight: 'bold' }}
              >
                {user.descricao.split(' ')[0]}
              </span>
            </div>
          )}

          <button
            className="header-btn header-logout-btn"
            onClick={handleLogout}
            title="Sair"
          >
            <FaSignOutAlt /> <span className="mobile-hide">Sair</span>
          </button>
        </div>
      </header>

      {!isOnline && (
        <div style={{
          backgroundColor: '#dc3545', color: 'white',
          textAlign: 'center', padding: '8px',
          fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 9,
        }}>
          ⚠️ Atenção: Você está operando Offline. As vendas serão salvas no dispositivo e sincronizadas depois.
        </div>
      )}

      <main className="pdv-split-layout">
        <section className="left-panel">
          <div className="product-display-banner">
            <h2>{selectedProduct ? selectedProduct.name : 'CAIXA LIVRE'}</h2>
            <span className="sku-display">
              {selectedProduct ? `Cód: ${selectedProduct.sku}` : 'Aguardando item...'}
            </span>
          </div>

          <div className="product-image-placeholder">
            {selectedProduct
              ? <FaBoxOpen size={80} color="#005A8D" />
              : <span className="logo-placeholder">WAVE</span>}
          </div>

          <div className="input-stack">
            <div className="input-group-vertical">
              <label>
                <FaBarcode /> Busca Rápida (F6) |{' '}
                <span
                  style={{ color: 'green', cursor: 'pointer', marginLeft: '4px', fontWeight: 'bold' }}
                  onClick={() => setIsQuantityModalOpen(true)}
                >
                  QTD (F7)
                </span>
                {itemQty > 1 && (
                  <span className="multiplier-indicator">{itemQty}x</span>
                )}
              </label>
              
              <div style={{ display: 'flex', width: '100%' }}>
                <input
                  ref={quickSearchInputRef}
                  type="text"
                  inputMode="search"
                  value={quickSearchTerm}
                  onChange={e => setQuickSearchTerm(e.target.value)}
                  placeholder="Ler código de barras..."
                  disabled={!isReadyToSale}
                  className="big-input"
                  style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                />
                <button
                  onClick={() => setIsScannerOpen(true)}
                  disabled={!isReadyToSale}
                  style={{
                    width: '60px',
                    height: '40px', /* Altura unificada com os inputs compactos */
                    backgroundColor: '#005A8D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0 4px 4px 0',
                    cursor: isReadyToSale ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}
                  title="Escanear com a Câmera"
                >
                  <FaCamera />
                </button>
              </div>
            </div>

            <div className="input-group-vertical">
              <label><FaSearch /> Produto (F2)</label>
              <Select
                ref={productSelectRef}
                options={productOptions}
                value={selectedProduct
                  ? { value: selectedProduct, label: `${selectedProduct.id} - ${selectedProduct.name}` }
                  : null}
                onChange={(option: SingleValue<any>) => handleProductSelect(option ? option.value : null)}
                placeholder="Pesquisar por nome..."
                isDisabled={!isReadyToSale}
                menuPortalTarget={document.body}
                styles={{
                  menuPortal: base => ({ ...base, zIndex: 9999 }),
                  control:    base => ({ ...base, minHeight: '40px', fontSize: '1rem' }),
                }}
              />
            </div>

            <div className="input-row-split">
              <div className="input-group-vertical">
                <label>Quantidade</label>
                <input
                  ref={qtyInputRef}
                  type="number"
                  inputMode="numeric"
                  value={itemQty}
                  onChange={e => setItemQty(Number(e.target.value))}
                  min={1}
                  className="big-number-input"
                />
              </div>
              <div className="input-group-vertical">
                <label>Valor Unitário</label>
                <input
                  type="text"
                  value={(itemPrice / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  readOnly
                  className={`big-number-input read-only${selectedProductPromo?.isActive ? ' promo-active-input' : ''}`}
                />
                {selectedProductPromo?.isActive && (
                  <span style={{
                    color: '#28a745', fontSize: '0.8rem', fontWeight: 'bold',
                    marginTop: '4px', display: 'block',
                  }}>
                    🏷️ {selectedProductPromo.message}
                  </span>
                )}
              </div>
            </div>

            <div className="input-row-split">
              <div className="input-group-vertical">
                <label>Desconto (R$)</label>
                <input
                  ref={discountInputRef}
                  type="text"
                  inputMode="decimal"
                  value={(itemDiscount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                    setItemDiscount(val ? parseFloat(val) * 100 : 0);
                  }}
                  className="big-number-input"
                />
              </div>
              <div className="input-group-vertical total-highlight">
                <label>Total do Item</label>
                <div className="lcd-display">
                  {(itemTotal / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <button
              ref={registerButtonRef}
              className="action-btn-register"
              onClick={handleAddItemToCart}
              disabled={!selectedProduct}
            >
              <FaCheck style={{ marginRight: '8px' }} /> REGISTRAR ITEM
            </button>
          </div>
        </section>

        <section className="right-panel">
          <div className="top-selectors-bar">
            <div className="sel-group">
              <label>
                Cliente (F3)
                {isCustomerLocked && (
                  <span title="Travado pelo Ponto de Venda" style={{ marginLeft: '5px', cursor: 'help' }}>🔒</span>
                )}
              </label>
              <Select
                ref={customerSelectRef}
                options={customerOptions}
                onChange={(opt) => setSelectedCustomer(opt ? opt.value : null)}
                value={selectedCustomer
                  ? { value: selectedCustomer, label: selectedCustomer.name }
                  : null}
                placeholder="Selecione o Cliente..."
                menuPortalTarget={document.body}
                className="compact-select"
                isDisabled={isCustomerLocked}
              />
            </div>

            <div className="sel-group">
              <label>
                Unidade (F4)
                {isUnidadeLocked && (
                  <span title="Travado pelo Ponto de Venda" style={{ marginLeft: '5px', cursor: 'help' }}>🔒</span>
                )}
              </label>
              <Select
                ref={unidadeSelectRef}
                options={unidadeOptions}
                onChange={(opt) => setSelectedUnidade(opt ? opt.value : null)}
                value={selectedUnidade
                  ? { value: selectedUnidade, label: selectedUnidade.descricao }
                  : null}
                placeholder="Unidade..."
                menuPortalTarget={document.body}
                className="compact-select"
                isDisabled={isUnidadeLocked}
              />
            </div>

            <div className="sel-group">
              <label>
                Tabela (F5)
                {isTableLocked && (
                  <span title="Travado pelo Ponto de Venda" style={{ marginLeft: '5px', cursor: 'help' }}>🔒</span>
                )}
              </label>
              <Select
                ref={priceTableSelectRef}
                options={priceTableOptions}
                onChange={(opt) => handlePriceTableChangeAttempt(opt ? opt.value : null)}
                value={selectedPriceTable
                  ? { value: selectedPriceTable, label: selectedPriceTable.descricao }
                  : null}
                placeholder="Tabela..."
                menuPortalTarget={document.body}
                className="compact-select"
                isDisabled={isTableLocked}
              />
            </div>
          </div>

          <div className="receipt-paper">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Desc.</th>
                  <th className="text-center">Qtd</th>
                  <th className="text-right">Unit.</th>
                  <th className="text-right">Total</th>
                  <th className="text-center">X</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, idx) => (
                  <tr key={`${item.productId}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td className="desc-col">{item.name}</td>
                    <td className="text-center">{item.quantity}</td>
                    <td className="text-right">
                      {((item.unitPrice - item.desconto) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-bold">
                      {(((item.unitPrice - item.desconto) * item.quantity) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-center">
                      <button
                        className="trash-btn"
                        onClick={() => updateCartQuantity(item.productId, -item.quantity)}
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} style={{ padding: 0, height: 0 }}>
                    <div ref={endOfCartRef} />
                  </td>
                </tr>
              </tbody>
            </table>

            {cart.length === 0 && (
              <div className="empty-state">CAIXA ABERTO - AGUARDANDO ITENS</div>
            )}
          </div>

          <div className="total-footer-panel">
            <div className="volumes-info">
              <span>Itens: {cart.length}</span>
              <span>Vol: {cart.reduce((acc, i) => acc + i.quantity, 0)}</span>
            </div>
            <div className="grand-total-display">
              <span className="label">TOTAL A PAGAR</span>
              <span className={`value ${totalCents === 0 ? 'zero' : ''}`}>
                {(totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

          <footer className="pdv-footer">
            <button
              className="footer-button help"
              onClick={() => setIsShortcutsModalOpen(true)}
            >
              <FaQuestionCircle /> AJUDA (F1)
            </button>
            <button
              className="footer-button"
              onClick={() => setIsProductModalOpen(true)}
              disabled={!selectedPriceTable}
            >
              <FaList /> PRODUTOS
            </button>
            {isFaturamentoMode && (
              <button
                className={`footer-button ${cpfNota ? 'cpf-active' : ''}`}
                onClick={() => setIsCpfModalOpen(true)}
                title="Informar CPF na Nota (F9)"
              >
                <FaIdCard /> {cpfNota ? `CPF: ${cpfNota}` : 'CPF NOTA (F9)'}
              </button>
            )}
            <button
              className="footer-button confirm"
              onClick={() => setIsCheckoutModalOpen(true)}
              disabled={cart.length === 0}
            >
              <FaCheck /> FINALIZAR VENDA (F8)
            </button>
          </footer>
        </section>
      </main>

      {/* A Barra Inferior de Carrinho foi MOVIDA PARA CÁ para garantir fixação absoluta no Mobile */}
      <div className="mobile-bottom-bar">
        <div className="total-text">
          Total: {(totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>
        <button onClick={() => setIsMobileCartOpen(true)}>
          Ver Carrinho ({cart.length})
        </button>
      </div>

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {isProductModalOpen && (
        <ProductSelectionModal
          onClose={() => setIsProductModalOpen(false)}
          products={availableProducts}
          cartItems={cart}
          onQuantityChange={updateCartQuantity}
        />
      )}

      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        onConfirm={handleConfirmCheckout}
        total={totalCents}
        formasPagamento={formasPagamento}
        prazosPagamento={prazosPagamento}
        lockedFinalidade={lockedFinalidade}
        pdvSerieId={pdvSerieId}
      />

      <QuantityModal
        isOpen={isQuantityModalOpen}
        onClose={() => setIsQuantityModalOpen(false)}
        onConfirm={handleQuantityConfirm}
        initialValue={itemQty}
      />

      {isFaturamentoMode && (
        <CpfModal
          isOpen={isCpfModalOpen}
          onClose={() => setIsCpfModalOpen(false)}
          onConfirm={handleCpfConfirm}
          initialCpf={cpfNota}
        />
      )}

      {isTableConfirmOpen && (
        <div className="confirmation-modal-overlay">
          <div className="confirmation-modal-content">
            <h3>Trocar Tabela?</h3>
            <p>Itens serão recalculados com os preços da nova tabela.</p>
            <div className="confirmation-actions">
              <button className="modal-btn cancel" onClick={cancelPriceTableChange}>
                CANCELAR
              </button>
              <button className="modal-btn confirm" onClick={confirmPriceTableChange}>
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚨 OVERLAY DE CARREGAMENTO (ENVIANDO VENDA) 🚨 */}
      {isProcessingSale && (
        <div className="processing-overlay">
            <div className="processing-content">
                <FaSync className="spin-icon-large" />
                <h2>Enviando Venda...</h2>
                <p>Aguarde o retorno do sistema e autorização da SEFAZ.</p>
            </div>
        </div>
      )}
      
      {/* 📷 LEITOR DE CÓDIGO DE BARRAS HTML5 📷 */}
      <BarcodeScanner 
        isActive={isScannerOpen}
        onScan={(code) => {
          setIsScannerOpen(false); // Fecha a câmera
          setQuickSearchTerm(code); // Dispara o useEffect de debounce que adiciona ao carrinho
        }}
        onClose={() => setIsScannerOpen(false)}
      />

    </div>
  );
};

export default PosPage;