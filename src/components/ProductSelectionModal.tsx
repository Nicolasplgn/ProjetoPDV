import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FaTimes, FaPlus, FaMinus, FaSearch, FaSync, FaCheck } from 'react-icons/fa'; 
import './ProductSelectionModal.css';// <--- Adicionei FaCheck
import type { Product, TransactionItem } from '../types';
import { pullAllProductsAndPrices } from '../services/syncService'; 
import toast from 'react-hot-toast';
import './ProductSelectionModal.css';

interface ProductSelectionModalProps {
  onClose: () => void;
  products: Product[];
  cartItems: TransactionItem[];
  onQuantityChange: (productId: string, change: number) => void;
}

const ProductSelectionModal: React.FC<ProductSelectionModalProps> = ({ 
  onClose, 
  products, 
  cartItems, 
  onQuantityChange 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focar no input ao abrir
  useEffect(() => {
    if (searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, []);

  const cartMap = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach(item => {
      map.set(item.productId, item.quantity);
    });
    return map;
  }, [cartItems]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return products;

    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.marca && p.marca.toLowerCase().includes(term)) ||
      p.id.toString().includes(term)
    );
  }, [searchTerm, products]);

  const handleManualProductSync = async () => {
    setIsSyncing(true);
    try {
        if (pullAllProductsAndPrices) {
            await pullAllProductsAndPrices();
            toast.success("Lista de produtos atualizada!");
        } else {
            toast.error("Serviço de sincronização não configurado.");
        }
    } catch (error) {
        console.error(error);
        toast.error("Erro ao buscar produtos.");
    } finally {
        setIsSyncing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="product-modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="product-modal-header">
          <h2>Selecione um Produto</h2>
          
          <div className="header-actions">
            <button 
                className="sync-products-btn" 
                onClick={handleManualProductSync} 
                disabled={isSyncing}
                title="Atualizar lista de produtos agora"
            >
                <FaSync className={isSyncing ? 'spin-icon' : ''} />
                {isSyncing ? ' Atualizando...' : ' Atualizar'}
            </button>

            <button className="close-modal-btn" onClick={onClose} title="Fechar (ESC)">
              <FaTimes />
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="product-search-bar-container">
            <div className="search-input-wrapper">
                <FaSearch className="search-icon" />
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar por nome, código, marca ou cód. de barras..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {/* PRODUCTS GRID */}
        <div className="products-grid-scroll">
            {filteredProducts.length > 0 ? (
                <div className="products-grid">
                    {filteredProducts.map(product => {
                        const qty = cartMap.get(product.id) || 0;
                        const hasStock = product.stock > 0;

                        return (
                            <div 
                                key={product.id} 
                                className={`product-card ${qty > 0 ? 'in-cart-highlight' : ''}`}
                            >
                                <div className="card-header">
                                    <span className="product-name" title={product.name}>{product.name}</span>
                                </div>
                                <div className="card-body">
                                    <div className="info-row">
                                        <span className="label">Marca:</span>
                                        <span className="value">{product.marca || '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="label">Cód:</span>
                                        <span className="value">{product.id}</span>
                                        <span className="separator">|</span>
                                        <span className="label">Estoque:</span>
                                        <span className={`value ${!hasStock ? 'no-stock' : ''}`}>{product.stock}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="label">Barras:</span>
                                        <span className="value">{product.sku || '-'}</span>
                                    </div>
                                    
                                    <div className="price-display">
                                        {(product.price / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                </div>
                                
                                {/* Controles de Ação */}
                                <div className="card-actions">
                                    {qty > 0 ? (
                                        <div className="qty-controls">
                                            <button 
                                                className="qty-btn minus" 
                                                onClick={() => onQuantityChange(product.id, -1)}
                                            >
                                                <FaMinus />
                                            </button>
                                            <span className="qty-value">{qty}</span>
                                            <button 
                                                className="qty-btn plus" 
                                                onClick={() => onQuantityChange(product.id, 1)}
                                            >
                                                <FaPlus />
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            className="add-product-btn" 
                                            onClick={() => onQuantityChange(product.id, 1)}
                                        >
                                            <FaPlus /> Adicionar
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="no-results">
                    <p>Nenhum produto encontrado com "{searchTerm}".</p>
                </div>
            )}
        </div>

        {/* --- NOVO RODAPÉ COM BOTÃO CONFIRMAR --- */}
        <div className="product-modal-footer">
            <div className="footer-info">
                {cartItems.length > 0 ? (
                    <span><b>{cartItems.length}</b> itens selecionados</span>
                ) : (
                    <span>Nenhum item selecionado</span>
                )}
            </div>
            <button className="confirm-selection-btn" onClick={onClose}>
                <FaCheck /> Confirmar Seleção
            </button>
        </div>
        {/* --------------------------------------- */}

      </div>
    </div>
  );
};

export default ProductSelectionModal;