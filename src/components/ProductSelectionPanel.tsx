import React, { useState, useEffect, useRef } from 'react';
// CORREÇÃO: Removido FaTimes
import { FaSearch, FaSync, FaBox, FaArrowLeft } from 'react-icons/fa';
// CORREÇÃO: Removido TransactionItem
import type { Product } from '../types';
import { pullAllProductsAndPrices } from '../services/syncService';
import toast from 'react-hot-toast';
import './ProductSelectionPanel.css';

interface ProductSelectionPanelProps {
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
}

const ProductSelectionPanel: React.FC<ProductSelectionPanelProps> = ({ 
  onClose, 
  products, 
  onSelectProduct 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(products);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1); 
  const [isSyncing, setIsSyncing] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const filtered = products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      p.id.toString().includes(term)
    );
    setFilteredProducts(filtered);
    setSelectedIndex(0);
  }, [searchTerm, products]);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredProducts.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredProducts.length) {
          onSelectProduct(filteredProducts[selectedIndex]);
        }
      } else if (e.key === 'F6') {
          e.preventDefault();
          searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredProducts, selectedIndex, onSelectProduct]);

  const handleManualProductSync = async () => {
    setIsSyncing(true);
    try {
        await pullAllProductsAndPrices();
        toast.success("Catálogo atualizado!");
    } catch (error) {
        toast.error("Erro ao atualizar.");
    } finally {
        setIsSyncing(false);
    }
  };

  return (
    <div className="product-selection-panel">
      
      <div className="panel-header">
        <button className="back-btn" onClick={onClose} title="Voltar (ESC)">
            <FaArrowLeft />
        </button>
        <h3>Catálogo de Produtos</h3>
        <button 
            className="sync-mini-btn" 
            onClick={handleManualProductSync} 
            disabled={isSyncing}
            title="Atualizar Produtos"
        >
            <FaSync className={isSyncing ? 'spin-icon' : ''} />
        </button>
      </div>

      <div className="panel-search">
        <FaSearch className="search-icon" />
        <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSelectedIndex(-1)}
        />
      </div>

      <div className="panel-grid-container">
        {filteredProducts.length > 0 ? (
            <div className="panel-grid">
                {filteredProducts.map((product, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                        <div 
                            key={product.id} 
                            ref={isSelected ? selectedRef : null}
                            className={`mini-product-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelectProduct(product)}
                        >
                            <div className="card-icon">
                                <FaBox />
                            </div>
                            <div className="card-info">
                                <span className="p-name">{product.name}</span>
                                <div className="p-details">
                                    <span className="p-sku">Cód: {product.id}</span>
                                    <span className={`p-stock ${product.stock <= 0 ? 'alert' : ''}`}>Est: {product.stock}</span>
                                </div>
                                <span className="p-price">
                                    {(product.price / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="panel-empty">
                <p>Nenhum produto encontrado.</p>
            </div>
        )}
      </div>
      
      <div className="panel-footer-hint">
        <small>Use ⬆⬇ para navegar e <strong>ENTER</strong> para selecionar.</small>
      </div>
    </div>
  );
};

export default ProductSelectionPanel;