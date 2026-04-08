import React, { useState, useRef, useEffect } from 'react';
import { FaTimes, FaCheck } from 'react-icons/fa';
import { useLiveQuery } from 'dexie-react-hooks';
import type { FormaPagamento, PrazoPagamento } from '../types';
import { db } from '../db/dexie';
import toast from 'react-hot-toast';
import './CheckoutModal.css';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  formasPagamento: FormaPagamento[];
  prazosPagamento: PrazoPagamento[];
  onConfirm: (
    finalidade: string,
    formaId: string,
    prazoId: string,
    faturSerieId?: number
  ) => void;
  lockedFinalidade?: string | null;
  pdvSerieId?: number;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  total,
  formasPagamento,
  prazosPagamento,
  onConfirm,
  lockedFinalidade,
  pdvSerieId,
}) => {
  const [finalidade, setFinalidade]         = useState('');
  const [formaId, setFormaId]               = useState('');
  const [prazoId, setPrazoId]               = useState('');
  const [selectedSerieId, setSelectedSerieId] = useState<number | null>(null);

  // Carrega séries do Dexie
  const series = useLiveQuery(() => db.faturSeries?.toArray() ?? Promise.resolve([]), []) || [];

  const isFaturamento =
    (lockedFinalidade?.toLowerCase() === 'faturamento') ||
    (finalidade.toLowerCase() === 'faturamento');

  // Quando o modal abre: aplica finalidade travada, reseta campos,
  // e pré-seleciona a série do PDV
  useEffect(() => {
    if (isOpen) {
      if (lockedFinalidade) {
        setFinalidade(lockedFinalidade.toUpperCase());
      } else {
        setFinalidade('');
      }
      setFormaId('');
      setPrazoId('');
      // Pré-seleciona a série configurada no PDV (se existir)
      setSelectedSerieId(pdvSerieId ?? null);
    }
  }, [isOpen, lockedFinalidade, pdvSerieId]);

  // Refs para navegação por teclado
  const finalidadeRef = useRef<HTMLSelectElement>(null);
  const formaRef      = useRef<HTMLSelectElement>(null);
  const prazoRef      = useRef<HTMLSelectElement>(null);
  const serieRef      = useRef<HTMLSelectElement>(null);
  const btnRef        = useRef<HTMLButtonElement>(null);

  // Foca no primeiro campo editável ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (lockedFinalidade) {
          formaRef.current?.focus();
        } else {
          finalidadeRef.current?.focus();
        }
      }, 100);
    }
  }, [isOpen, lockedFinalidade]);

  if (!isOpen) return null;

  const handleConfirmClick = () => {
    const finalidadeToUse = lockedFinalidade || finalidade;

    if (!finalidadeToUse || !formaId || !prazoId) {
      toast.error('Preencha todos os campos!');
      return;
    }

    // Série é obrigatória apenas em modo faturamento
    if (isFaturamento && series.length > 0 && !selectedSerieId) {
      toast.error('Selecione a série da NF!');
      serieRef.current?.focus();
      return;
    }

    onConfirm(
      finalidadeToUse,
      formaId,
      prazoId,
      selectedSerieId ?? undefined
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    nextRef: React.RefObject<HTMLElement | null> | null
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      } else {
        handleConfirmClick();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmClick();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const formattedTotal = (total / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  // Série do PDV para exibir como referência no label
  const pdvSerie = series.find(s => s.id === pdvSerieId);

  return (
    <div className="checkout-modal-overlay">
      <div className="checkout-modal-container">

        {/* Cabeçalho */}
        <div className="checkout-modal-header">
          <h3>Finalizar Venda</h3>
          <button className="checkout-close-btn" onClick={onClose} tabIndex={-1}>
            <FaTimes />
          </button>
        </div>

        {/* Display do Total */}
        <div className="checkout-total-display">
          <span className="total-label">TOTAL A PAGAR</span>
          <span className="total-value">{formattedTotal}</span>
        </div>

        {/* Corpo / Inputs */}
        <div className="checkout-modal-body">

          {/* FINALIDADE */}
          <div className="form-group">
            <label>Finalidade da Venda</label>
            <select
              ref={finalidadeRef}
              className="checkout-input"
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
              onKeyDown={(e) => {
                if (!lockedFinalidade) {
                  handleKeyDown(e, formaRef);
                }
              }}
              disabled={!!lockedFinalidade}
              tabIndex={lockedFinalidade ? -1 : 0}
              style={lockedFinalidade ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed' } : {}}
            >
              <option value="" disabled>Selecione a finalidade...</option>
              <option value="NORMAL">Normal</option>
              <option value="CONSUMO">Consumo</option>
              <option value="CORTESIA">Cortesia</option>
              <option value="FATURAMENTO">Faturamento</option>
            </select>
            {lockedFinalidade && (
              <small style={{ color: '#666', fontStyle: 'italic', display: 'block', marginTop: '4px' }}>
                🔒 Finalidade travada pelo PDV: {lockedFinalidade}
              </small>
            )}
          </div>

          {/* FORMA DE PAGAMENTO */}
          <div className="form-group">
            <label>Forma de Pagamento</label>
            <select
              ref={formaRef}
              className="checkout-input"
              value={formaId}
              onChange={(e) => setFormaId(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, prazoRef)}
              tabIndex={0}
            >
              <option value="" disabled>Selecione...</option>
              {formasPagamento.map((fp) => (
                <option key={fp.id} value={fp.id}>{fp.descricao}</option>
              ))}
            </select>
          </div>

          {/* PRAZO DE PAGAMENTO */}
          <div className="form-group">
            <label>Prazo de Pagamento</label>
            <select
              ref={prazoRef}
              className="checkout-input"
              value={prazoId}
              onChange={(e) => setPrazoId(e.target.value)}
              onKeyDown={(e) =>
                handleKeyDown(e, isFaturamento && series.length > 0 ? serieRef : btnRef)
              }
              tabIndex={0}
            >
              <option value="" disabled>Selecione...</option>
              {prazosPagamento.map((pp) => (
                <option key={pp.id} value={pp.id}>{pp.descricao}</option>
              ))}
            </select>
          </div>

          {/* SÉRIE DA NF — somente em modo faturamento */}
          {isFaturamento && series.length > 0 && (
            <div className="form-group">
              <label>
                Série da NF
                {pdvSerie && (
                  <small style={{ color: '#005A8D', fontWeight: 'normal', marginLeft: '8px' }}>
                    (PDV padrão: {pdvSerie.serie} — {pdvSerie.descricao})
                  </small>
                )}
              </label>
              <select
                ref={serieRef}
                className="checkout-input"
                value={selectedSerieId ?? ''}
                onChange={(e) => setSelectedSerieId(Number(e.target.value))}
                onKeyDown={(e) => handleKeyDown(e, btnRef)}
                tabIndex={0}
                style={
                  selectedSerieId === pdvSerieId
                    ? { borderColor: '#005A8D', backgroundColor: '#f0f8ff' }
                    : { borderColor: '#ffc107', backgroundColor: '#fffdf0' }
                }
              >
                <option value="" disabled>Selecione a série...</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.serie} — {s.descricao}
                    {s.id === pdvSerieId ? ' ⭐ (PDV padrão)' : ''}
                  </option>
                ))}
              </select>
              {selectedSerieId !== pdvSerieId && selectedSerieId !== null && (
                <small style={{ color: '#d16d00', fontStyle: 'italic', display: 'block', marginTop: '4px' }}>
                  ⚠️ Série diferente da configurada no PDV
                </small>
              )}
              {selectedSerieId === pdvSerieId && selectedSerieId !== null && (
                <small style={{ color: '#107c10', fontStyle: 'italic', display: 'block', marginTop: '4px' }}>
                  ✅ Série padrão do PDV selecionada
                </small>
              )}
            </div>
          )}
        </div>

        {/* Rodapé / Botão */}
        <div className="checkout-modal-footer">
          <button
            ref={btnRef}
            className="confirm-sale-btn"
            onClick={handleConfirmClick}
            onKeyDown={handleButtonKeyDown}
            tabIndex={0}
          >
            <FaCheck /> Confirmar Venda
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;