import React from 'react';
import { FaTimes, FaKeyboard } from 'react-icons/fa';
import './ShortcutsModal.css';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Enter', action: 'Navegar para próximo campo / Adicionar Produto' },
    { key: 'F1', action: 'Exibir/Ocultar esta tela de ajuda' },
    { key: 'F2', action: 'Focar na busca de produtos' },
    { key: 'F3', action: 'Focar na busca de clientes' },
    { key: 'F4', action: 'Focar na seleção de Unidade' },
    { key: 'F5', action: 'Focar na Tabela de Preço' },
    { key: 'F6', action: 'Busca rápida por código/barras' },
    { key: 'F8', action: 'Finalizar Venda (Checkout)' },
    { key: 'ESC', action: 'Fechar janelas / Limpar foco' },
  ];

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal-container" onClick={(e) => e.stopPropagation()}>
        
        <div className="shortcuts-header">
          <h3><FaKeyboard /> Atalhos de Teclado</h3>
          <button className="shortcuts-close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="shortcuts-body">
          <table className="shortcuts-table">
            <thead>
              <tr>
                {/* CORREÇÃO AQUI: uso de style em vez de atributo width */}
                <th style={{ width: '80px' }}>Tecla</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((s, index) => (
                <tr key={index}>
                  <td className="key-cell"><span className="key-badge">{s.key}</span></td>
                  <td>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="shortcuts-footer">
          <small>Pressione a tecla correspondente para ativar a função.</small>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;