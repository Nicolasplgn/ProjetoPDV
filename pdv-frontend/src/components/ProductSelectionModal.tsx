// src/components/ProductSelectionModal.tsx
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import type { Product } from '../types';
import './ProductSelectionModal.css';

interface Props {
  onClose: () => void;
  onProductSelect: (product: Product) => void;
}

const ProductSelectionModal = ({ onClose, onProductSelect }: Props) => {
  const products = useLiveQuery(() => db.products.toArray(), []);

  const handleProductClick = (product: Product) => {
    onProductSelect(product);
    onClose(); // Fecha o modal após selecionar um produto
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Selecione um Produto</h2>
          <button onClick={onClose} className="close-button">&times;</button>
        </div>
        <div className="modal-body">
          <div className="product-selection-grid">
            {products?.map(product => (
              <div 
                key={product.id} 
                className="product-card-modal" 
                onClick={() => handleProductClick(product)}
              >
                <div className="product-name">{product.name}</div>
                <div className="product-price">R$ {(product.price / 100).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductSelectionModal;