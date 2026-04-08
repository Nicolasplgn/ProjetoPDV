// src/components/CpfModal.tsx

import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaIdCard } from 'react-icons/fa';

interface CpfModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cpf: string) => void;
  initialCpf: string;
}

const CpfModal: React.FC<CpfModalProps> = ({ isOpen, onClose, onConfirm, initialCpf }) => {
  const [cpf, setCpf] = useState(initialCpf);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCpf(initialCpf);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialCpf]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(cpf.replace(/\D/g, ''));
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="confirmation-modal-overlay" onClick={onClose} style={{zIndex: 11000}}>
      <div className="confirmation-modal-content" onClick={(e) => e.stopPropagation()} style={{padding: '20px', width: '350px'}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#005A8D' }}>
            <FaIdCard /> CPF na Nota (F9)
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#666' }}><FaTimes /></button>
        </div>
        
        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555', fontSize: '0.9rem' }}>Informe o CPF/CNPJ (Opcional):</label>
          <input
            ref={inputRef}
            type="text"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Apenas números..."
            style={{ width: '100%', padding: '10px', fontSize: '1.2rem', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>
        
        <div className="confirmation-actions">
          <button className="modal-btn cancel" onClick={() => { setCpf(''); onConfirm(''); }}>LIMPAR</button>
          <button className="modal-btn confirm" onClick={() => onConfirm(cpf.replace(/\D/g, ''))}>CONFIRMAR</button>
        </div>
      </div>
    </div>
  );
};

export default CpfModal;