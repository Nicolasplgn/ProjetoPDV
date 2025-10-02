// src/services/receiptService.ts
import jsPDF from 'jspdf';
import type { TransactionItem, User } from '../types';

/**
 * Gera um comprovante de venda em PDF e o abre em uma nova aba para impressão/salvamento.
 * @param items - Itens da venda
 * @param total - Valor total em centavos
 * @param user - Operador que realizou a venda
 * @param clientTransactionId - ID local da transação
 */
export const generateReceipt = (
  items: TransactionItem[], 
  total: number, 
  user: User,
  clientTransactionId: string
) => {
  const doc = new jsPDF();
  const date = new Date();
  
  // Cabeçalho
  doc.setFontSize(18);
  doc.text("Comprovante de Venda", 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`Data: ${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`, 10, 30);
  doc.text(`Operador: ${user.username}`, 10, 35);
  doc.text(`ID da Transação: ${clientTransactionId.substring(0, 8)}`, 10, 40);

  // Linha divisória
  doc.line(10, 45, 200, 45);

  // Itens
  doc.setFontSize(12);
  doc.text("Produto", 10, 55);
  doc.text("Qtd", 120, 55);
  doc.text("Subtotal", 170, 55, { align: 'right' });
  
  let y = 65;
  items.forEach(item => {
    doc.setFontSize(10);
    doc.text(item.name, 10, y);
    doc.text(String(item.quantity), 120, y);
    const subtotal = (item.unitPrice * item.quantity / 100).toFixed(2);
    doc.text(`R$ ${subtotal}`, 170, y, { align: 'right' });
    y += 7;
  });

  // Linha divisória
  doc.line(10, y, 200, y);
  
  // Total
  y += 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("TOTAL:", 10, y);
  doc.text(`R$ ${(total / 100).toFixed(2)}`, 170, y, { align: 'right' });

  // Abre o PDF em uma nova aba
  doc.output('dataurlnewwindow');

  // Alternativamente, para forçar o download:
  // doc.save(`comprovante-${clientTransactionId.substring(0, 8)}.pdf`);
};