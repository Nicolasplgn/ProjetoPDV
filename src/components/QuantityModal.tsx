import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaCalculator } from 'react-icons/fa';
import './QuantityModal.css';

interface QuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  initialValue: number;
}

const QuantityModal: React.FC<QuantityModalProps> = ({ isOpen, onClose, onConfirm, initialValue }) => {
  const [value, setValue] = useState(initialValue.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(''); // Começa vazio para facilitar digitação
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const qty = parseInt(value);
      if (qty > 0) {
        onConfirm(qty);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="quantity-modal-overlay" onClick={onClose}>
      <div className="quantity-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="quantity-header">
          <h3><FaCalculator /> Alterar Quantidade (Multiplicador)</h3>
          <button onClick={onClose} className="close-btn"><FaTimes /></button>
        </div>
        <div className="quantity-body">
          <label>Informe a quantidade:</label>
          <input
            ref={inputRef}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex: 10"
            min="1"
          />
          <small>Pressione <b>ENTER</b> para confirmar ou <b>ESC</b> para cancelar.</small>
        </div>
        <div className="quantity-footer">
          <button className="confirm-btn" onClick={() => {
             const qty = parseInt(value);
             if (qty > 0) onConfirm(qty);
          }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuantityModal;