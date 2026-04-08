// src/services/receiptService.ts

import { db } from '../db/dexie';
import type { Transaction } from '../types';
import toast from 'react-hot-toast';

// ==============================================================================
// FUNÇÃO PRINCIPAL DE IMPRESSÃO
// ==============================================================================
export const generateReceipt = async (transaction: Transaction, operatorName: string) => {
    try {
        // Recarrega do banco local para garantir que pegamos a URL do cupom mais recente
        const refreshed = await db.transactions.get(transaction.clientTransactionId);
        const tx = refreshed ?? transaction;

        // 1. TENTA ABRIR O PDF DA WAVE DIRETO NO SISTEMA
        // Se a URL existir, ele abre e MATA a execução (return) para não imprimir o não-fiscal.
        if (tx.url_cupom) {
            console.log('🖨️ Abrindo Cupom Fiscal direto no sistema:', tx.url_cupom);
            
            const printWindow = window.open(tx.url_cupom, '_blank', 'noopener,noreferrer');
            
            if (printWindow) {
                // Se abriu a aba, limpamos o comando de corte (se houver impressora local)
                enviarComandoCorte().catch(() => {});
                return; // 🛑 MATA A EXECUÇÃO AQUI! IMPEDE QUE O NÃO FISCAL SEJA IMPRESSO.
            } else {
                toast.error("O navegador bloqueou o pop-up. Permita pop-ups para imprimir.");
                return; // 🛑 Mata aqui também.
            }
        }

        // 2. RECIBO NÃO FISCAL MANUAL (Caso não tenha NF-e, seja offline ou erro na Sefaz)
        console.log('🖨️ Gerando recibo não fiscal (offline/pedido)...');

        let pdvSettings = null;
        try {
            pdvSettings = await db.pdvSettings
                .where('pessoa_operador_id')
                .equals(Number(transaction.operatorId))
                .first();
        } catch (e) {
            console.warn('Erro ao buscar configurações do PDV.', e);
        }

        const filialNome = pdvSettings ? pdvSettings.descricao : 'WAVE PDV';

        let receiptHtml = `
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; color: #000; }
                    .center { text-align: center; }
                    .left { text-align: left; }
                    .bold { font-weight: bold; }
                    .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                    .amount-col { text-align: right; }
                </style>
            </head>
            <body>
                <div class="center bold">
                    <h2>${filialNome}</h2>
                    <p>RECIBO DE VENDA<br>(SEM VALOR FISCAL)</p>
                </div>
                <div class="divider"></div>
                <div class="left">
                    <b>Data:</b> ${new Date().toLocaleString('pt-BR')}<br>
                    <b>Operador:</b> ${operatorName}<br>
                    <b>Cliente:</b> ${transaction.customer.name.substring(0, 30)}
                </div>
                <div class="divider"></div>
                <table>
                    <thead><tr><th>Qtd</th><th>Item</th><th class="amount-col">Total</th></tr></thead>
                    <tbody>
        `;

        transaction.items.forEach(item => {
            const totalItemFormat = (((item.unitPrice - item.desconto) * item.quantity) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            receiptHtml += `
                <tr>
                    <td>${item.quantity}</td>
                    <td>${item.name}</td>
                    <td class="amount-col">${totalItemFormat}</td>
                </tr>
            `;
        });

        const totalGeralFormat = (transaction.totalCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, style: 'currency', currency: 'BRL' });

        receiptHtml += `
                    </tbody>
                </table>
                <div class="divider"></div>
                <div class="bold" style="text-align: right; font-size: 14px; margin-top: 5px;">
                    TOTAL: ${totalGeralFormat}
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
            printWindow.document.write(receiptHtml);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        }

        enviarComandoCorte().catch(() => {});

    } catch (error) {
        console.error('Erro ao gerar recibo:', error);
        toast.error('Erro ao abrir o cupom para impressão.');
    }
};

const enviarComandoCorte = async () => {
    try {
        await fetch('http://localhost:3001/cut', {
            method: 'POST',
            mode: 'no-cors'
        });
    } catch (e) { }
};