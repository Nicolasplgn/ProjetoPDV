// src/services/syncService.ts

import apiClient from '../api';
import { db } from '../db/dexie';
import type {
    Product, Customer, TabelaPreco, Filial, Transaction, TransactionItem,
    PrazoPagamento, FormaPagamento, TituloFinanceiro, User, PdvSetting,
    LocalLogradouroTipo, CupomNfResponse
} from '../types';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { setSyncStatus } from '../components/Syncstatus';
import { checkRealInternet } from '../utils/network';

// ==============================================================================
// FUNÇÃO AUXILIAR DE PARSE DE NÚMEROS (Aceita padrão BR "24,68" ou US "24.68")
// ==============================================================================
const safeParseFloat = (val: any): number => {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    if (String(val).includes(',')) {
        const str = String(val).replace(/\./g, '').replace(',', '.');
        return parseFloat(str) || 0;
    }
    return parseFloat(String(val)) || 0;
};

// ==============================================================================
// FUNÇÃO AUXILIAR DE DATA LOCAL (Para evitar erro de Fuso Horário SEFAZ > 5min)
// ==============================================================================
const getLocalISOTime = (): string => {
    const tzoffset     = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
    return localISOTime;
};

// ==============================================================================
// FUNÇÃO AUXILIAR — parse da resposta dos endpoints /fatur_pdv_cupom
// Injeta dinamicamente a BASE da empresa (host_https) na URL do PDF.
// ==============================================================================
const parseCupomResponse = (raw: any): CupomNfResponse => {
    if (raw == null) return {};

    // Tenta pegar a URL base (nome da empresa) dinamicamente do login
    let baseUrl = 'https://app.wavegt.com.br';
    try {
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.host_https) {
                baseUrl = user.host_https.replace(/\/$/, '');
            }
        }
    } catch (e) {
        console.error('Erro ao ler host_https do usuário:', e);
    }

    let obj = raw;

    if (typeof raw === 'string') {
        const str = raw.trim();
        if (str.startsWith('{') || str.startsWith('[')) {
            try { obj = JSON.parse(str); } catch { obj = { status: str }; }
        } else if (str.includes('.pdf')) {
            try {
                if (str.startsWith('http')) {
                    const urlObj = new URL(str);
                    const pathname = urlObj.pathname.startsWith('/') ? urlObj.pathname : '/' + urlObj.pathname;
                    return { url_file: baseUrl + pathname };
                } else {
                    const pathname = str.startsWith('/') ? str : '/' + str;
                    return { url_file: baseUrl + pathname };
                }
            } catch (e) {
                return { url_file: str };
            }
        } else {
            return { status: str };
        }
    }

    let urlEncontrada: string | undefined = undefined;

    if (obj.url_file) {
        urlEncontrada = obj.url_file;
    }
    else if (typeof obj.message === 'string') {
        const msgStr = obj.message.trim();
        if (msgStr.startsWith('{')) {
            try {
                const innerObj = JSON.parse(msgStr);
                if (innerObj.url_file) {
                    urlEncontrada = innerObj.url_file;
                }
            } catch { }
        }
    }

    if (urlEncontrada) {
        urlEncontrada = urlEncontrada.replace(/\\/g, '');
        
        try {
            if (urlEncontrada.startsWith('http')) {
                const urlObj = new URL(urlEncontrada);
                const pathname = urlObj.pathname.startsWith('/') ? urlObj.pathname : '/' + urlObj.pathname;
                return { url_file: baseUrl + pathname };
            } else {
                const pathname = urlEncontrada.startsWith('/') ? urlEncontrada : '/' + urlEncontrada;
                return { url_file: baseUrl + pathname };
            }
        } catch (e) {
            return { url_file: urlEncontrada };
        }
    }

    return obj as CupomNfResponse;
};

// ==============================================================================
// INTERFACES AUXILIARES
// ==============================================================================
interface WaveProductResponse {
    id: number;
    produto_id: number;
    descricao: string;
    cod_barra: string;
    estoque: number | string;
    preco_venda: number | string;
    preco_promocao?: number | string | null;
    validade_promocao?: string | null;
    produto_tabela_id: string;
    produto_marca_descricao: string;
    desconto?: string | number;
    produto_unidade_id?: number;
    qtde_total?: string | number;
    tributo_tab_classfiscal_id?: number;
    custo_venda?:      number | string | null;
    custo_aquisicaco?: number | string | null;
    custo_compra?:     number | string | null;
}

interface WaveTabelaPreco {
    id: number;
    descricao: string;
}

interface WaveFilial {
    id: number;
    descricao: string;
    pj_fantasia?: string;
}

interface PagedWaveResponse<T> {
    resultados: T[];
    proximo?: string;
}

// ==============================================================================
// SISTEMA DE LOGS
// ==============================================================================
type LogType = 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING' | 'PAYLOAD' | 'URL' | 'DB' | 'AUTH' | 'STEP' | 'DEBUG';

const logSync = (type: LogType, message: string, data?: any) => {
    const styles: Record<LogType, string> = {
        INFO:    'color: #007acc; font-weight: bold;',
        SUCCESS: 'color: #107c10; font-weight: bold; font-size: 1.1em;',
        ERROR:   'color: white; background: #d13438; font-weight: bold; font-size: 1.2em; padding: 2px 5px; border-radius: 3px;',
        WARNING: 'color: #333; background: #ffc107; font-weight: bold; padding: 1px 4px; border-radius: 2px;',
        PAYLOAD: 'color: #d16d00; font-weight: bold;',
        URL:     'color: #8a2be2; font-style: italic; text-decoration: underline;',
        DB:      'color: #6f42c1; font-weight: bold;',
        AUTH:    'color: #00bcd4; font-weight: bold;',
        STEP:    'color: white; background: #005A8D; font-weight: bold; padding: 2px 8px; border-radius: 10px;',
        DEBUG:   'color: #e91e63; font-weight: bold; background: #fce4ec; padding: 2px 5px;'
    };

    console.log(`%c[${type}] ${message}`, styles[type]);

    if (data !== undefined) {
        console.log(data);
    }
};

// ==============================================================================
// TOKEN DO USUÁRIO
// ==============================================================================
const getCurrentUserToken = (): string | null => {
    const userStr = localStorage.getItem('currentUser');

    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            return user.uuid || user.token || null;
        } catch (error) {
            console.error("Erro ao ler token do usuário para Sync:", error);
        }
    }

    return null;
};

// ==============================================================================
// GUARD DE CONCORRÊNCIA
// ==============================================================================
let _isSyncing = false;

// ==============================================================================
// CUPOM PDV — EMISSÃO, CONSULTA E IMPRESSÃO DE NF-e
// ==============================================================================

export const emitirCupomNf = async (faturNfId: number): Promise<CupomNfResponse> => {
    const id = Number(faturNfId);

    if (!Number.isFinite(id) || id <= 0) {
        throw new Error(`fatur_nf_id inválido para emissão do cupom: ${String(faturNfId)}`);
    }

    logSync('STEP', `📄 Emitindo NF-e (POST /fatur_pdv_cupom/${id})...`);
    const response = await apiClient.post(`/fatur_pdv_cupom/${id}`, {});
    const result   = parseCupomResponse(response.data);
    logSync('INFO', `📄 Resposta emissão NF ${id}:`, result);

    return result;
};

export const consultarCupomNf = async (
    faturNfId: number,
    maxTentativas = 8,
    intervaloMs   = 3000
): Promise<CupomNfResponse> => {
    const id = Number(faturNfId);

    if (!Number.isFinite(id) || id <= 0) {
        throw new Error(`fatur_nf_id inválido para consulta do cupom: ${String(faturNfId)}`);
    }

    logSync('STEP', `🔍 Consultando NF-e (POST /fatur_pdv_cupom/consultar/${id}) — até ${maxTentativas} tentativas...`);

    let ultimoResultado: CupomNfResponse = {};

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        logSync('INFO', `🔍 Tentativa ${tentativa}/${maxTentativas}...`);

        const response  = await apiClient.post(`/fatur_pdv_cupom/consultar/${id}`, {});
        ultimoResultado = parseCupomResponse(response.data);

        logSync('INFO', `🔍 Status (tentativa ${tentativa}):`, ultimoResultado);

        if (ultimoResultado.url_file) {
            logSync('SUCCESS', `✅ NF-e autorizada! URL pronta e corrigida: ${ultimoResultado.url_file}`);
            return ultimoResultado;
        }

        if (tentativa < maxTentativas) {
            await new Promise((r) => setTimeout(r, intervaloMs));
        }
    }

    logSync('WARNING', `⚠️ NF-e não autorizada após ${maxTentativas} consultas. Último status:`, ultimoResultado);
    return ultimoResultado;
};

export const imprimirCupomNf = async (faturNfId: number): Promise<CupomNfResponse> => {
    const id = Number(faturNfId);

    if (!Number.isFinite(id) || id <= 0) {
        throw new Error(`fatur_nf_id inválido para impressão do cupom: ${String(faturNfId)}`);
    }

    logSync('STEP', `🖨️ Obtendo URL de impressão (POST /fatur_pdv_cupom/imprimir/${id})...`);
    const response = await apiClient.post(`/fatur_pdv_cupom/imprimir/${id}`, {});
    const result   = parseCupomResponse(response.data);
    logSync('INFO', `🖨️ Resposta impressão NF ${id}:`, result);

    return result;
};

/**
 * FLUXO PRINCIPAL DE CUPOM:
 * 1. Tenta emissão.
 * 2. Faz polling de consulta até obter a autorização.
 * 3. FORÇA A CHAMADA DE IMPRESSÃO (Obrigatório para o Wave criar o PDF físico).
 * 4. Aguarda 6 segundos para a criação no disco e retorna a URL já com a BASE corrigida.
 */
export const executarFluxoCupom = async (faturNfId: number): Promise<string | undefined> => {
    try {
        let urlCupom: string | undefined = undefined;

        // ETAPA 1 — Tenta emitir
        const resultEmissao = await emitirCupomNf(faturNfId);
        if (resultEmissao.url_file) {
            urlCupom = resultEmissao.url_file;
        }

        // ETAPA 2 — Consulta (polling) se não veio na emissão ou está processando
        if (!urlCupom || String(resultEmissao.status).includes('processamento')) {
            logSync('INFO', `🔄 SEFAZ processando... Iniciando polling de consulta...`);
            const resultConsulta = await consultarCupomNf(faturNfId);
            if (resultConsulta.url_file) {
                urlCupom = resultConsulta.url_file;
            }
        }

        // ETAPA 3 — O PULO DO GATO: FORÇA A IMPRESSÃO!
        logSync('STEP', `🔨 Forçando a API da Wave a desenhar o PDF físico chamando o endpoint de Impressão...`);
        const resultImpressao = await imprimirCupomNf(faturNfId);
        
        if (resultImpressao.url_file) {
            urlCupom = resultImpressao.url_file;
        }

        // ETAPA 4 — DELAY DE SEGURANÇA
        if (urlCupom) {
            logSync('INFO', `⏳ URL CORRIGIDA PARA ABRIR: ${urlCupom}`);
            logSync('INFO', `⏳ Dando 6 segundos de vantagem para o servidor salvar o PDF no disco antes de abrirmos a aba...`);
            await new Promise(resolve => setTimeout(resolve, 6000));
            return urlCupom;
        }

        logSync('WARNING', `⚠️ Fluxo de cupom encerrado sem url_file para NF ${faturNfId}.`);
        return undefined;

    } catch (err) {
        logSync('WARNING', `⚠️ Falha no fluxo de cupom para NF ${faturNfId} (não bloqueia a venda):`, err);
        return undefined;
    }
};

// ==============================================================================
// PAYLOAD DE PEDIDO (NORMAL — FLUXO ANTIGO)
// ==============================================================================
const buildCompletePedidoPayload = (trans: Transaction, operatorId: string) => {
    const totalPedidoFloat = Number((trans.totalCents / 100).toFixed(2));
    const dataAtual        = getLocalISOTime().split('T')[0];

    const itensPayload = trans.items.map((item) => {
        const precoFloat  = Number((item.unitPrice / 100).toFixed(2));
        let descontoFloat = Number((item.desconto / 100).toFixed(2));

        if (descontoFloat > precoFloat) {
            descontoFloat = 0;
        }

        return {
            tipo:               'Saida',
            qtde:               Number(item.quantity),
            produto_id:         Number(item.productId),
            produto_unidade_id: item.produto_unidade_id ? Number(item.produto_unidade_id) : null,
            preco:              precoFloat,
            desconto:           descontoFloat,
            total:              Number(((item.unitPrice - item.desconto) * item.quantity / 100).toFixed(2)),
        };
    });

    return {
        tipo:                  'Saida',
        finalidade:            trans.finalidade || 'NORMAL',
        obs1:                  `PDV ID: ${trans.clientTransactionId.substring(0, 8)}`,
        cadastro:              dataAtual,
        baixa:                 null,
        pessoa_unidade_id:     Number(trans.filialId),
        pessoa_responsavel_id: Number(operatorId),
        pedido_origem_id:      13,
        produto_tabela_id:     Number(trans.table_id),
        pedido_produto:        itensPayload,
        total_produto:         totalPedidoFloat,
        total_pedido:          totalPedidoFloat,
        financ_forma_pgto_id:  Number(trans.formaPagamentoId),
        financ_prazo_pgto_id:  Number(trans.prazoPagamentoId),
    };
};

// ==============================================================================
// PAYLOAD DE FATURAMENTO (NF CAPA + ITENS)
// ==============================================================================
const buildFaturNfPayload = (
    trans: Transaction,
    operatorId: string,
    pdvSettings: PdvSetting,
    regraIcms: any,
    regraPis: any,
    regraCofins: any,
    logradouroTipos: LocalLogradouroTipo[],
    operadorNome: string,
    codigoNf: number
) => {
    const totalFloat    = Number((trans.totalCents / 100).toFixed(2));
    const dataHoraEnvio = getLocalISOTime();

    const docFiscal = trans.cpfCnpjNota
        ? trans.cpfCnpjNota.replace(/\D/g, '')
        : (trans.customer.document ? trans.customer.document.replace(/\D/g, '') : '');

    const faturSerieId = trans.fatur_serie_id ?? pdvSettings.fatur_serie_id ?? null;

    let tipoId         = trans.customer.local_logradouro_tipo_id ?? null;
    let logradouroText = trans.customer.logradouro || "";

    if (!tipoId && logradouroText && logradouroTipos.length > 0) {
        const words = logradouroText.trim().split(/\s+/);

        if (words.length > 1) {
            const firstWord = words[0].toUpperCase().replace(/[^A-Z]/g, '');

            const match = logradouroTipos.find((t) => {
                const desc  = t.descricao?.toUpperCase().replace(/[^A-Z]/g, '') || '';
                const sigla = t.sigla?.toUpperCase().replace(/[^A-Z]/g, '')     || '';
                return desc === firstWord || sigla === firstWord;
            });

            if (match) {
                tipoId         = match.id;
                logradouroText = words.slice(1).join(' ');
                logSync('SUCCESS', `🪄 Auto-correção de logradouro: Tipo ID ${tipoId} (${match.descricao}) | Rua: ${logradouroText}`);
            }
        }
    }

    const enderecoPayload = {
        cep:                      trans.customer.cep                      || "",
        logradouro:               logradouroText,
        numero:                   trans.customer.numero                   || "",
        bairro:                   trans.customer.bairro                   || "",
        complemento:              trans.customer.complemento              || "",
        contato_fone:             trans.customer.fone1                    || "",
        local_municipio_id:       trans.customer.local_municipio_id       ?? null,
        local_uf_id:              trans.customer.local_uf_id              ?? null,
        local_pais_id:            trans.customer.local_pais_id            ?? null,
        local_logradouro_tipo_id: tipoId,
    };

    const financ_plano_id      = pdvSettings.fatur_operacao?.financ_plano_id      ?? null;
    const financ_cent_custo_id = pdvSettings.fatur_operacao?.financ_cent_custo_id ?? null;

    let total_icms_base    = 0;
    let total_icms_valor   = 0;
    let total_pis_base     = 0;
    let total_pis_valor    = 0;
    let total_cofins_base  = 0;
    let total_cofins_valor = 0;
    let subtotal_produto   = 0;
    let desconto_produto   = 0;

    const itensPayload = trans.items.map((item) => {
        const precoFloat  = Number((item.unitPrice / 100).toFixed(2));
        let descontoFloat = Number((item.desconto / 100).toFixed(2));

        if (descontoFloat > precoFloat) {
            descontoFloat = 0;
        }

        const qtdeFloat         = Number(item.quantity);
        const subtotalItemFloat = Number((precoFloat * qtdeFloat).toFixed(2));
        const totalDescontoItem = Number((descontoFloat * qtdeFloat).toFixed(2));
        const totalItemFloat    = Number((subtotalItemFloat - totalDescontoItem).toFixed(2));

        subtotal_produto += subtotalItemFloat;
        desconto_produto += totalDescontoItem;

        const icms_aliq  = regraIcms ? (Number(regraIcms.saida_icms_aliq) || 0) : 0;
        const icms_base  = icms_aliq > 0 ? totalItemFloat : 0;
        const icms_valor = Number((icms_base * (icms_aliq / 100)).toFixed(2));

        const pis_aliq   = regraPis ? (Number(regraPis.saida_piscofins_aliq) || 0) : 0;
        const pis_base   = pis_aliq > 0 ? totalItemFloat : 0;
        const pis_valor  = Number((pis_base * (pis_aliq / 100)).toFixed(2));

        const cofins_aliq  = regraCofins ? (Number(regraCofins.saida_piscofins_aliq) || 0) : 0;
        const cofins_base  = cofins_aliq > 0 ? totalItemFloat : 0;
        const cofins_valor = Number((cofins_base * (cofins_aliq / 100)).toFixed(2));

        total_icms_base    += icms_base;
        total_icms_valor   += icms_valor;
        total_pis_base     += pis_base;
        total_pis_valor    += pis_valor;
        total_cofins_base  += cofins_base;
        total_cofins_valor += cofins_valor;

        return {
            produto_id:                 Number(item.productId),
            produto_unidade_id:         item.produto_unidade_id ? Number(item.produto_unidade_id) : null,
            qtde:                       qtdeFloat,
            preco:                      precoFloat,
            desconto:                   descontoFloat,
            total:                      totalItemFloat,

            tributo_tab_cfop_id:        pdvSettings.tributo_tab_cfop_id,

            tributo_regra_icms_st_id:   regraIcms ? regraIcms.id : null,
            tributo_tab_icms_st_cst_id: regraIcms ? regraIcms.saida_tributo_tab_icms_st_cst_id : null,

            tributo_regra_pis_id:       regraPis ? regraPis.id : null,
            tributo_tab_pis_cst_id:     regraPis ? regraPis.saida_tributo_tab_piscofins_cst_id : null,

            tributo_regra_cofins_id:    regraCofins ? regraCofins.id : null,
            tributo_tab_cofins_cst_id:  regraCofins ? regraCofins.saida_tributo_tab_piscofins_cst_id : null,

            icms_base,
            icms_aliq,
            icms_valor,

            pis_base,
            pis_aliq,
            pis_valor,

            cofins_base,
            cofins_aliq,
            cofins_valor,
        };
    });

    const payload = {
        codigo:                codigoNf,
        tipo:                  'saida',
        pdv:                   1,
        pessoa_cpf_cnpj:       docFiscal,
        faturar:               'produto',
        finalidade:            'normal',

        fatur_operacao_id:     pdvSettings.fatur_operacao_id,
        fatur_serie_id:        faturSerieId,
        tributo_tab_cfop_id:   pdvSettings.tributo_tab_cfop_id,

        financ_plano_id,
        financ_cent_custo_id,

        ...enderecoPayload,

        cadastro:              dataHoraEnvio,
        saida_entrada:         dataHoraEnvio,

        pessoa_unidade_id:     Number(trans.filialId),
        pessoa_id:             Number(trans.customer.id),
        pessoa_responsavel_id: Number(operatorId),
        produto_tabela_id:     Number(trans.table_id),
        estoque_setor_id:      pdvSettings.estoque_setor_id,
        financ_forma_pgto_id:  Number(trans.formaPagamentoId),
        financ_prazo_pgto_id:  Number(trans.prazoPagamentoId),

        subtotal_produto:      Number(subtotal_produto.toFixed(2)),
        desconto_produto:      Number(desconto_produto.toFixed(2)),
        desconto_produto_perc: 0,
        total_produto:         totalFloat,
        total_nf:              totalFloat,

        ativo:                 1,
        frete:                 'por_conta_emitente',
        consumidor_final:      1,
        presencial:            1,
        obs1:                  `VENDA PDV - CAIXA | Operador: ${operadorNome}`,

        total_icms_base:       Number(total_icms_base.toFixed(2)),
        total_icms_valor:      Number(total_icms_valor.toFixed(2)),
        total_pis_base:        Number(total_pis_base.toFixed(2)),
        total_pis_valor:       Number(total_pis_valor.toFixed(2)),
        total_cofins_base:     Number(total_cofins_base.toFixed(2)),
        total_cofins_valor:    Number(total_cofins_valor.toFixed(2)),

        fatur_nf_produto:      itensPayload,
    };

    return payload;
};

// ==============================================================================
// LIMPEZA DE VENDAS SINCRONIZADAS
// ==============================================================================
const clearSyncedTransactions = async () => {
    try {
        const GRACE_PERIOD_MS = 10 * 60 * 1000; 
        const now = Date.now();

        const count = await db.transactions
            .where('synced').equals(1)
            .and((t) => {
                if (t.status !== 'confirmed') return false;
                const createdAtMs = Date.parse(t.createdAt);
                if (!Number.isFinite(createdAtMs)) return false;
                return (now - createdAtMs) > GRACE_PERIOD_MS;
            })
            .delete();

        if (count > 0) {
            logSync('DB', `🧹 Limpeza Automática: ${count} venda(s) removida(s) do dispositivo.`);
        }
    } catch (error) {
        console.error("Erro ao limpar vendas antigas:", error);
    }
};

// ==============================================================================
// PUSH — ENVIO DE VENDAS AO SERVIDOR
// ==============================================================================
const pushTransactions = async (transactionsToPush: Transaction[]) => {
    if (transactionsToPush.length === 0) return;

    if (_isSyncing) {
        logSync('WARNING', '⏳ pushTransactions ignorado: já existe um envio em andamento.');
        return;
    }

    const isReallyOnline = await checkRealInternet();
    if (!isReallyOnline) {
        logSync('WARNING', '🚫 pushTransactions abortado: sem internet real.');
        return;
    }

    _isSyncing = true;
    setSyncStatus(true, 'Iniciando sincronização...');

    try {
        const logradouroTipos       = db.localLogradouroTipos ? await db.localLogradouroTipos.toArray() :[];
        const regraIcmsGlobal       = await db.tributoRegraIcmsSt.toCollection().first();
        const regrasPiscofinsGlobal = await db.tributoRegraPiscofins.toArray();
        const regraPisGlobal        = regrasPiscofinsGlobal.find((r) => r.piscofins === 'pis');
        const regraCofinsGlobal     = regrasPiscofinsGlobal.find((r) => r.piscofins === 'cofins');

        for (const trans of transactionsToPush) {
            let serverId: any = null;
            let stage         = 'INICIANDO';
            let operadorNome  = 'N/A';

            try {
                const userStr = localStorage.getItem('currentUser');
                if (userStr) {
                    const user = JSON.parse(userStr);
                    operadorNome = user.descricao || user.login || `pessoa_id ${trans.operatorId}`;
                }
            } catch (e) { /* silencioso */ }

            console.group(`🛒 Venda: ${trans.clientTransactionId.substring(0, 8)} | Cliente: ${trans.customer.name} | Op: ${operadorNome}`);

            try {
                setSyncStatus(true, `Preparando venda de ${trans.customer.name}...`);
                logSync('DB', `Atualizando status local → 'sincronizando'`);
                await db.transactions.update(trans.clientTransactionId, { status: 'sincronizando' });

                let pdvSettings = await db.pdvSettings
                    .where('pessoa_operador_id')
                    .equals(Number(trans.operatorId))
                    .first();

                if (!pdvSettings) {
                    const settingsStr = localStorage.getItem('pdv_active_settings');
                    if (settingsStr) {
                        try { pdvSettings = JSON.parse(settingsStr) as PdvSetting; }
                        catch (e) { logSync('ERROR', 'Falha ao parsear pdv_active_settings do localStorage.', e); }
                    }
                }

                const isFaturamento = pdvSettings && pdvSettings.finalidade === 'faturamento' && pdvSettings.fatur_operacao_id;

                if (isFaturamento) {
                    // ── ETAPA 1 ── NF
                    stage = 'POST /fatur_nf';
                    setSyncStatus(true, 'Criando Nota Fiscal...');
                    logSync('STEP', `1. CRIANDO FATURAMENTO DIRETO (NF)`);

                    const storageKey = `seq_nf_pdv_${pdvSettings!.id}`;
                    const seqAtual   = parseInt(localStorage.getItem(storageKey) || '1', 10);
                    const codigoNf   = Number(`${pdvSettings!.id}${seqAtual.toString().padStart(5, '0')}`);

                    const nfPayload  = buildFaturNfPayload(
                        trans, trans.operatorId, pdvSettings!,
                        regraIcmsGlobal, regraPisGlobal, regraCofinsGlobal,
                        logradouroTipos, operadorNome, codigoNf
                    );

                    const nfResponse = await apiClient.post('/fatur_nf', nfPayload);
                    serverId = nfResponse.data?.id || nfResponse.data?.resultado?.id || nfResponse.data?.data?.id;

                    if (!serverId) throw new Error("API não retornou ID do Faturamento.");

                    localStorage.setItem(storageKey, (seqAtual + 1).toString());
                    logSync('SUCCESS', `✅ Faturamento criado! ID NF: ${serverId}`);

                    // ── ETAPA 2 ── Estoque
                    stage = 'POST /estoque_movimento';
                    setSyncStatus(true, 'Movimentando estoque...');
                    logSync('STEP', `2. INSERINDO ITENS NO ESTOQUE`);

                    const dataEstoqueSomenteDia = getLocalISOTime().split('T')[0];

                    const produtosDexie = await Promise.all(
                        nfPayload.fatur_nf_produto.map((nfItem) =>
                            db.products
                                .where('[id+produto_tabela_id]')
                                .equals([String(nfItem.produto_id), String(trans.table_id)])
                                .first()
                        )
                    );

                    const estoquePayloads = nfPayload.fatur_nf_produto.map((nfItem, index) => {
                        const originalItem = trans.items.find((i) => String(i.productId) === String(nfItem.produto_id));
                        const produtoDexie = produtosDexie[index];
                        const custoBase    = Number(originalItem?.custo_venda ?? produtoDexie?.custo_venda ?? 0);
                        const custo        = Number(custoBase.toFixed(4));
                        const preco_tabela = produtoDexie ? Number((produtoDexie.price / 100).toFixed(2)) : nfItem.preco;

                        return {
                            pessoa_unidade_id:                 Number(trans.filialId),
                            fatur_nf_id:                       serverId,
                            cadastro:                          dataEstoqueSomenteDia,
                            tipo:                              "saida",
                            movimento:                         "faturamento",
                            calcular_estoque:                  1,
                            produto_id:                        nfItem.produto_id,
                            estoque_setor_id:                  pdvSettings!.estoque_setor_id,
                            produto_tabela_id:                 Number(trans.table_id),
                            produto_unidade_id:                nfItem.produto_unidade_id,
                            tributo_tab_classfiscal_id:        originalItem?.tributo_tab_classfiscal_id || null,
                            descritivo:                        "",
                            custo,
                            preco:                             nfItem.preco,
                            preco_tabela,
                            desconto:                          nfItem.desconto,
                            qtde:                              nfItem.qtde,
                            total:                             nfItem.total,
                            fator_preco:                       1,
                            fator_qtde:                        1,
                            tributo_tab_cfop_id:               nfItem.tributo_tab_cfop_id,
                            tributo_regra_icms_st_id:          nfItem.tributo_regra_icms_st_id,
                            tributo_tab_icms_st_cst_id:        nfItem.tributo_tab_icms_st_cst_id,
                            icms_modalidade:                   regraIcmsGlobal?.saida_icms_modalidade || "margem_valor_agregado",
                            st_modalidade:                     regraIcmsGlobal?.saida_st_modalidade   || "preco_tabelado_maximo_sugerido",
                            tributo_tab_icms_st_origem_cst_id: regraIcmsGlobal?.saida_tributo_tab_icms_st_origem_cst_id || null,
                            tributo_regra_pis_id:              nfItem.tributo_regra_pis_id,
                            tributo_tab_pis_cst_id:            nfItem.tributo_tab_pis_cst_id,
                            tributo_regra_cofins_id:           nfItem.tributo_regra_cofins_id,
                            tributo_tab_cofins_cst_id:         nfItem.tributo_tab_cofins_cst_id,
                            icms_base:                         nfItem.icms_base,
                            icms_aliq:                         nfItem.icms_aliq,
                            icms_valor:                        nfItem.icms_valor,
                            pis_base:                          nfItem.pis_base,
                            pis_aliq:                          nfItem.pis_aliq,
                            pis_valor:                         nfItem.pis_valor,
                            cofins_base:                       nfItem.cofins_base,
                            cofins_aliq:                       nfItem.cofins_aliq,
                            cofins_valor:                      nfItem.cofins_valor,
                            st_valor:                          0,
                            ipi_valor:                         0,
                            cbs_ibs_base:                      0,
                            ibs_valor:                         0,
                            cbs_valor:                         0,
                        };
                    });

                    await Promise.all(estoquePayloads.map((ep) => apiClient.post('/estoque_movimento', ep)));
                    logSync('SUCCESS', `📦 Estoque movimentado: ${estoquePayloads.length} item(ns).`);

                    // ── ETAPA 3 ── Financeiro
                    stage = 'POST /financ_titulo';
                    setSyncStatus(true, 'Gerando financeiro...');
                    logSync('STEP', `3. GERANDO FINANCEIRO`);

                    const prazoPgtoCompleto = await db.prazosPagamento.get(trans.prazoPagamentoId);
                    if (!prazoPgtoCompleto) throw new Error(`Prazo ID ${trans.prazoPagamentoId} não encontrado.`);

                    const { totalCents, formaPagamentoId } = trans;
                    const numParcelas = prazoPgtoCompleto.parcelas > 0 ? prazoPgtoCompleto.parcelas : 1;
                    const valorBase   = Math.floor(totalCents / numParcelas);
                    const resto       = totalCents - (valorBase * numParcelas);
                    const hoje        = new Date();
                    const dataFinanceiro = getLocalISOTime().split('T')[0];
                    const anoComp     = dataFinanceiro.split('-')[0];
                    const mesComp     = dataFinanceiro.split('-')[1];

                    for (let i = 1; i <= numParcelas; i++) {
                        const diasParaVencimento = (i - 1) * prazoPgtoCompleto.dias_intervalo;
                        const dataVenc = new Date(hoje.getTime());
                        dataVenc.setDate(hoje.getDate() + diasParaVencimento);
                        const valorAtual = valorBase + (i === 1 ? resto : 0);
                        const valorFloat = Number((valorAtual / 100).toFixed(2));

                        const tituloPayload = {
                            codigo:                "0",
                            pessoa_unidade_id:     Number(trans.filialId),
                            tipo:                  "receber",
                            pessoa_id:             Number(trans.customer.id),
                            cadastro:              dataFinanceiro,
                            competencia:           dataFinanceiro,
                            competencia_mes:       mesComp,
                            competencia_ano:       anoComp,
                            parcela:               i,
                            fatur_nf_id:           serverId,
                            financ_forma_pgto_id:  Number(formaPagamentoId),
                            pessoa_responsavel_id: Number(trans.operatorId),
                            vencimento:            dataVenc.toISOString().split('T')[0],
                            valor:                 valorFloat,
                            historico:             `PDV NF #${serverId} Parc ${i}/${numParcelas}`,
                            adic_01: 0.0, adic_02: 0.0, adic_03: 0.0, adic_04: 0.0, adic_05: 0.0,
                            adic_06: 0.0, adic_07: 0.0, adic_08: 0.0, adic_09: 0.0,
                            ativo: 1,
                        };

                        const tituloResponse = await apiClient.post('/financ_titulo', tituloPayload);
                        const tituloId = tituloResponse.data?.id || tituloResponse.data?.resultado?.id || tituloResponse.data?.data?.id;

                        if (tituloId && pdvSettings?.fatur_operacao) {
                            const operacao = pdvSettings.fatur_operacao;
                            if (operacao.financ_plano_id) {
                                try {
                                    await apiClient.post('/financ_titulo_plano', {
                                        financ_titulo_id: tituloId,
                                        financ_plano_id:  operacao.financ_plano_id,
                                        valor:            valorFloat,
                                        proporcional:     100
                                    });
                                } catch (e) { /* silencioso */ }
                            }
                            if (operacao.financ_cent_custo_id) {
                                try {
                                    await apiClient.post('/financ_titulo_cent_custo', {
                                        financ_titulo_id:     tituloId,
                                        financ_cent_custo_id: operacao.financ_cent_custo_id,
                                        valor:                valorFloat
                                    });
                                } catch (e) { /* silencioso */ }
                            }
                        }
                    }

                    logSync('SUCCESS', '💰 Financeiro e rateios gerados.');

                    // ── ETAPA 4 ── SEFAZ E IMPRESSÃO COM ROTA CORRIGIDA
                    stage = 'POST /fatur_pdv_cupom';
                    setSyncStatus(true, 'Aguardando autorização da SEFAZ... ⏳');
                    logSync('STEP', `4. EMISSÃO NF-e E CUPOM PDV`);

                    const urlCupom = await executarFluxoCupom(Number(serverId));

                    logSync('DB', `Atualizando Dexie → synced=1, status=confirmed`);
                    await db.transactions.update(trans.clientTransactionId, {
                        synced:              1,
                        status:              'confirmed',
                        serverTransactionId: serverId.toString(),
                        lastError:           '',
                        url_cupom:           urlCupom,
                    });

                    setSyncStatus(true, 'Venda confirmada pela SEFAZ! ✅');
                    logSync('SUCCESS', `✅ Venda concluída e Cupom Vinculado!`);

                } else {
                    // ── FLUXO LEGADO ── Pedido
                    stage = 'POST /pedido';
                    setSyncStatus(true, 'Criando pedido...');
                    logSync('STEP', `1. CRIANDO PEDIDO (FLUXO ANTIGO)`);

                    const completePayload = buildCompletePedidoPayload(trans, trans.operatorId);
                    const urlPedido       = `/pedido/${trans.customer.id}`;
                    const pedidoResponse  = await apiClient.post(urlPedido, completePayload);
                    serverId = pedidoResponse.data?.id || pedidoResponse.data?.resultado?.id || pedidoResponse.data?.data?.id;

                    if (!serverId) throw new Error("API não retornou ID do pedido.");
                    logSync('SUCCESS', `✅ Pedido criado! ID Wave: ${serverId}`);

                    stage = 'POST /pedido_financ_titulo';
                    setSyncStatus(true, 'Gerando financeiro do pedido...');
                    logSync('STEP', '2. GERANDO FINANCEIRO (PEDIDO)');

                    const prazoPgtoCompleto = await db.prazosPagamento.get(trans.prazoPagamentoId);
                    if (prazoPgtoCompleto) {
                        const { totalCents, formaPagamentoId } = trans;
                        const numParcelas = prazoPgtoCompleto.parcelas > 0 ? prazoPgtoCompleto.parcelas : 1;
                        const valorBase   = Math.floor(totalCents / numParcelas);
                        const resto       = totalCents - (valorBase * numParcelas);
                        const hoje        = new Date();

                        for (let i = 1; i <= numParcelas; i++) {
                            const diasParaVencimento = (i - 1) * prazoPgtoCompleto.dias_intervalo;
                            const dataVencimento = new Date(hoje.getTime());
                            dataVencimento.setDate(hoje.getDate() + diasParaVencimento);
                            const valorAtual = valorBase + (i === 1 ? resto : 0);

                            const tituloPayload: TituloFinanceiro = {
                                pedido_id:            serverId,
                                financ_forma_pgto_id: Number(formaPagamentoId),
                                parcela:              i,
                                valor:                Number((valorAtual / 100).toFixed(2)),
                                vencimento:           dataVencimento.toISOString().split('T')[0],
                                historico:            `PDV #${serverId} Parc ${i}/${numParcelas}`,
                                recebimento:          'dinheiro',
                            };
                            await apiClient.post('/pedido_financ_titulo', tituloPayload);
                        }
                    }

                    logSync('SUCCESS', '💰 Financeiro gerado.');
                    logSync('DB', `Atualizando Dexie → synced=1, status=confirmed`);
                    await db.transactions.update(trans.clientTransactionId, {
                        synced:              1,
                        status:              'confirmed',
                        serverTransactionId: serverId.toString(),
                        lastError:           '',
                    });

                    setSyncStatus(true, 'Pedido confirmado! ✅');
                    logSync('SUCCESS', `✅ Venda concluída!`);
                }

            } catch (error: any) {
                let errorMsg    = 'Erro desconhecido';
                let errorDetail = '';

                if (axios.isAxiosError(error)) {
                    const apiResponse = error.response?.data;
                    errorMsg    = apiResponse?.detail ? JSON.stringify(apiResponse.detail) : (apiResponse?.message || error.message);
                    errorDetail = JSON.stringify(apiResponse, null, 2);
                    logSync('ERROR', `🛑 FALHA API em: ${stage}`, apiResponse);
                } else {
                    errorMsg = String(error);
                    logSync('ERROR', `🛑 FALHA INTERNA em: ${stage}`, error);
                }

                setSyncStatus(false, '');
                const nfRef = serverId ? ` | server_id=${serverId}` : '';
                toast.error(`Falha: ${errorMsg.substring(0, 100)}`);

                await db.transactions.update(trans.clientTransactionId, {
                    status:    'failed',
                    lastError: `${stage}${nfRef}: ${errorMsg}\n${errorDetail}`,
                });

            } finally {
                console.groupEnd();
            }
        }

        await clearSyncedTransactions();

    } finally {
        _isSyncing = false;
        setSyncStatus(false, '');
    }
};

// ==============================================================================
// SALVAR E EMPURRAR TRANSAÇÃO (Aguardando Sincronização)
// ==============================================================================
export const saveAndPushTransaction = async (
    cart: TransactionItem[],
    customer: Customer,
    filial: Filial,
    table: TabelaPreco,
    formaPgto: FormaPagamento,
    prazoPgto: PrazoPagamento,
    finalidade: string,
    user: User,
    totalCents: number,
    cpfCnpjNota?: string,
    faturSerieId?: number
): Promise<Transaction> => {

    if (!user || !user.pessoa_id) {
        logSync('ERROR', 'Tentativa de venda sem usuário logado!');
        throw new Error('Usuário inválido. Faça login novamente.');
    }

    const newTransaction: Transaction = {
        clientTransactionId: uuidv4(),
        operatorId:          user.pessoa_id.toString(),
        customer,
        cpfCnpjNota,
        filialId:            filial.id,
        table_id:            table.id,
        formaPagamentoId:    formaPgto.id,
        prazoPagamentoId:    prazoPgto.id,
        prazoPagamento:      prazoPgto,
        finalidade,
        items:               cart,
        totalCents,
        createdAt:           new Date().toISOString(),
        synced:              0,
        status:              'pending',
        serverTransactionId: undefined,
        lastError:           undefined,
        fatur_serie_id:      faturSerieId,
    };

    await db.transactions.add(newTransaction);

    const isReallyOnline = await checkRealInternet();

    if (isReallyOnline) {
        logSync('INFO', '🌐 Internet detectada! Aguardando o envio da venda e retorno da SEFAZ...');

        // Aguarda a sincronização terminar para garantir url_cupom
        await pushTransactions([newTransaction]);

        const updatedTrans = await db.transactions.get(newTransaction.clientTransactionId);

        if (updatedTrans && updatedTrans.status === 'confirmed') {
            toast.success('Venda concluída na Wave!');
            return updatedTrans;
        } else {
            toast.error('Erro ao faturar. Venda salva offline.');
            return updatedTrans || newTransaction;
        }
    } else {
        logSync('WARNING', '🚫 PDV Offline. A venda ficará aguardando na fila local.');
        toast('PDV Offline. Venda salva na fila.', { icon: '📶' });
        return newTransaction;
    }
};

// ==============================================================================
// SINCRONIZAR PENDENTES
// ==============================================================================
export const pushPendingTransactions = async (isManual = false) => {
    const isReallyOnline = await checkRealInternet();

    if (!isReallyOnline) {
        if (isManual) {
            toast.error('Sem conexão com a internet. Verifique sua rede.');
        }
        logSync('WARNING', '🚫 pushPendingTransactions abortado: sem internet real.');
        return;
    }

    const pendingTxs = await db.transactions.where('synced').equals(0).toArray();

    if (pendingTxs.length === 0) {
        await clearSyncedTransactions();
        if (isManual) {
            toast.success('Nada pendente.');
        }
        return;
    }

    await pushTransactions(pendingTxs);
};

// ==============================================================================
// PULL — DOWNLOAD DE DADOS DO SERVIDOR
// ==============================================================================

export const pullAllProductsAndPrices = async () => {
    try {
        const apiToken = getCurrentUserToken();

        if (!apiToken) {
            logSync('WARNING', 'PULL PRODUTOS cancelado: usuário não autenticado.');
            return;
        }

        const wakey          = import.meta.env.VITE_API_WAKEY;
        const pesquisaParams = `uuid:${apiToken}`;
        let page             = 1;
        const PAGE_SIZE      = 300;
        let hasMore          = true;
        let totalImported    = 0;

        logSync('STEP', 'PULL: PRODUTOS (Endpoint /wave_acesso_vw_produto)');
        await db.products.clear();

        while (hasMore) {
            logSync('INFO', `📦 Produtos: Baixando página ${page}...`);

            const response = await apiClient.get<{ resultados: WaveProductResponse[] }>(
                '/wave_acesso_vw_produto',
                {
                    params: {
                        pesquisa:        pesquisaParams,
                        coluna:          'uuid',
                        integrador:      'fv',
                        ordenar:         'descricao:asc',
                        page,
                        page_size:       PAGE_SIZE,
                        limit:           PAGE_SIZE,
                        qtde_por_pagina: PAGE_SIZE,
                        _cacheBust:      Date.now(),
                    },
                    headers: { wakey },
                }
            );

            const waveData     = response.data.resultados ||[];
            const totalPaginas = (response.data as any).total_paginas ?? null;

            if (waveData.length === 0) {
                logSync('INFO', '🚫 Página vazia. Fim dos produtos.');
                hasMore = false;
                break;
            }

            const produtosValidos = waveData.filter((p) => safeParseFloat(p.preco_venda) > 0);

            const productsForDb: Product[] = produtosValidos.map((p) => {
                const precoVendaRaw = safeParseFloat(p.preco_venda);
                const precoPromoRaw = safeParseFloat(p.preco_promocao);
                const descontoRaw   = safeParseFloat(p.desconto);
                const custoRaw      = safeParseFloat(p.custo_venda ?? p.custo_aquisicaco ?? p.custo_compra);

                const precoPromo    = precoPromoRaw > 0 ? Math.round(precoPromoRaw * 100) : undefined;
                const validadePromo = (p.validade_promocao != null && String(p.validade_promocao).trim() !== '')
                    ? String(p.validade_promocao).trim()
                    : undefined;

                return {
                    id:                         (p.produto_id || p.id).toString(),
                    sku:                        p.cod_barra || `ID-${p.id}`,
                    name:                       p.descricao,
                    marca:                      p.produto_marca_descricao || 'Sem Marca',
                    price:                      Math.round(precoVendaRaw * 100),
                    desconto:                   Math.round(descontoRaw * 100),
                    stock:                      safeParseFloat(p.estoque ?? p.qtde_total),
                    custo_venda:                custoRaw,
                    produto_unidade_id:         p.produto_unidade_id ? Number(p.produto_unidade_id) : undefined,
                    produto_tabela_id:          p.produto_tabela_id ? String(p.produto_tabela_id) : '1',
                    tributo_tab_classfiscal_id: p.tributo_tab_classfiscal_id ? Number(p.tributo_tab_classfiscal_id) : undefined,
                    preco_promocao:             precoPromo,
                    validade_promocao:          validadePromo,
                };
            });

            await db.products.bulkPut(productsForDb);
            totalImported += productsForDb.length;

            await new Promise((r) => setTimeout(r, 0));

            const emPromocaoNaPagina = productsForDb.filter((p) => p.preco_promocao && p.preco_promocao > 0);

            if (emPromocaoNaPagina.length > 0) {
                logSync('SUCCESS', `✅ Página ${page}: +${produtosValidos.length} produtos (Total: ${totalImported}) | 🏷️ ${emPromocaoNaPagina.length} em promoção`);
            } else {
                logSync('INFO', `✅ Página ${page}: +${produtosValidos.length} produtos. (Total: ${totalImported})`);
            }

            if (totalPaginas !== null && page >= totalPaginas) {
                hasMore = false;
            } else if (waveData.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        }

        const produtosComPromo = await db.products.filter((p) => (p.preco_promocao ?? 0) > 0).toArray();

        if (produtosComPromo.length > 0) {
            logSync('SUCCESS', `🏁 TOTAL: ${totalImported} produtos válidos | 🏷️ ${produtosComPromo.length} com promoção.`);
        } else {
            logSync('WARNING', `🏁 TOTAL: ${totalImported} produtos válidos | 🏷️ NENHUM produto com preco_promocao > 0 salvo.`);
        }

    } catch (error) {
        logSync('ERROR', 'Erro Pull Produtos', error);
        throw error;
    }
};

export const pullPromocoes = async () => {
    try {
        const apiToken = getCurrentUserToken();

        if (!apiToken) {
            return;
        }

        const wakey = import.meta.env.VITE_API_WAKEY;
        logSync('STEP', 'PULL: PROMOÇÕES (/wave_acesso_vw_produto/promocional)');

        const response = await apiClient.get<{ resultados: any[] }>('/wave_acesso_vw_produto/promocional', {
            params: {
                pesquisa:   apiToken,
                integrador: 'fv',
                page_size:  9999,
                _cacheBust: Date.now()
            },
            headers: { wakey }
        });

        const res      = response.data.resultados ||[];
        const comPromo = res.filter((item: any) => safeParseFloat(item.preco_promocao) > 0);

        logSync('INFO', `🏷️  ${comPromo.length} produto(s) em promoção retornado(s) na API.`);

        const promoMap = new Map<string, { preco_promocao: number; validade_promocao?: string }>();

        for (const item of comPromo) {
            const preco = safeParseFloat(item.preco_promocao);
            promoMap.set(`${(item.produto_id || item.id)}|${item.produto_tabela_id}`, {
                preco_promocao: Math.round(preco * 100),
                validade_promocao: (item.validade_promocao != null && String(item.validade_promocao).trim() !== '')
                    ? String(item.validade_promocao).trim()
                    : undefined
            });
        }

        const todosProdutos = await db.products.toArray();
        const atualizados: Product[] =[];

        for (const produto of todosProdutos) {
            const promo = promoMap.get(`${produto.id}|${produto.produto_tabela_id}`);
            if (promo) {
                atualizados.push({ ...produto, ...promo });
            }
        }

        if (atualizados.length > 0) {
            await db.products.bulkPut(atualizados);
        }

        logSync('SUCCESS', `🏷️  PROMOÇÕES: ${atualizados.length} produto(s) atualizado(s) no Dexie.`);

    } catch (error) {
        logSync('ERROR', 'Erro Pull Promoções', error);
    }
};

const pullCustomers = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        let page          = 1;
        const PAGE_SIZE   = 500;
        let hasMore       = true;
        let totalImported = 0;

        logSync('STEP', 'PULL: CLIENTES (Paginação Forçada)');
        await db.customers.clear();

        while (hasMore) {
            logSync('INFO', `👥 Clientes: Baixando página ${page}...`);

            const response = await apiClient.get<{ resultados: any[] }>('/pessoas', {
                params: {
                    pesquisa:        `classe.descricao:Cliente`,
                    integrador:      'fv',
                    ordenar:         'id:asc',
                    page,
                    page_size:       PAGE_SIZE,
                    limit:           PAGE_SIZE,
                    qtde_por_pagina: PAGE_SIZE,
                    _cacheBust:      Date.now()
                }
            });

            const res = response.data.resultados ||[];

            if (res.length === 0) {
                logSync('INFO', '🚫 Página vazia. Fim dos clientes.');
                break;
            }

            const customersForDb: Customer[] = res.map((c: any) => {
                const endArr = Array.isArray(c.enderecos) ? c.enderecos :[];
                const end = endArr.find((e: any) => e.tipo === 'principal')
                    || endArr.find((e: any) => e.tipo === 'entrega')
                    || endArr[0]
                    || null;

                return {
                    id:                       c.id.toString(),
                    name:                     c.descricao,
                    document:                 c.cpf_cnpj,
                    fantasia:                 c.pj_fantasia,
                    fone1:                    c.fone1,
                    email:                    c.email,
                    cadastro:                 c.cadastro,

                    cep:                      end?.cep        || undefined,
                    logradouro:               end?.logradouro  || undefined,
                    numero:                   end?.numero      || undefined,
                    bairro:                   end?.bairro      || undefined,
                    complemento:              end?.complemento || undefined,

                    local_municipio_id:       end?.municipio?.id            ? Number(end.municipio.id)            : undefined,
                    local_uf_id:              end?.uf?.id                   ? Number(end.uf.id)                   : undefined,
                    local_pais_id:            end?.pais?.id                 ? Number(end.pais.id)                 : undefined,
                    local_logradouro_tipo_id: end?.local_logradouro_tipo_id ? Number(end.local_logradouro_tipo_id) : undefined,
                };
            });

            await db.customers.bulkPut(customersForDb);
            totalImported += customersForDb.length;

            await new Promise((r) => setTimeout(r, 0));
            logSync('INFO', `✅ Página ${page}: +${res.length} clientes. (Total: ${totalImported})`);

            const totalPaginasClientes = (response.data as any).total_paginas ?? null;

            if (totalPaginasClientes !== null && page >= totalPaginasClientes) {
                hasMore = false;
            } else if (res.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        }

        logSync('SUCCESS', `🏁 TOTAL DE CLIENTES: ${totalImported}`);

    } catch (error) {
        logSync('ERROR', 'Erro Pull Clientes', error);
    }
};

const pullFiliais = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        logSync('STEP', 'PULL: FILIAIS');

        const response = await apiClient.get<PagedWaveResponse<WaveFilial>>('/vw_pessoas_unidades', {
            params: { page_size: 9999 }
        });

        if (response.data.resultados?.length > 0) {
            await db.filiais.bulkPut(
                response.data.resultados.map((f) => ({
                    id:            f.id.toString(),
                    descricao:     f.descricao,
                    nome_fantasia: f.pj_fantasia,
                }))
            );
            logSync('SUCCESS', 'Filiais OK.');
        }
    } catch (error) {
        logSync('ERROR', 'Erro Pull Filiais', error);
    }
};

const pullPriceTables = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        logSync('STEP', 'PULL: TABELAS DE PREÇO');

        const response = await apiClient.get<PagedWaveResponse<WaveTabelaPreco>>('/produtos_tabelas', {
            params: { page_size: 9999, ordenar: 'descricao:asc' }
        });

        if (response.data.resultados?.length > 0) {
            await db.priceTables.bulkPut(
                response.data.resultados.map((t) => ({
                    id:        t.id.toString(),
                    descricao: t.descricao,
                }))
            );
            logSync('SUCCESS', 'Tabelas OK.');
        }
    } catch (error) {
        logSync('ERROR', 'Erro Pull Tabelas', error);
    }
};

const pullFormasPagamento = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        logSync('STEP', 'PULL: FORMAS PGTO');

        const response = await apiClient.get<PagedWaveResponse<FormaPagamento>>('/financ_forma_pgto', {
            params: { page_size: 9999 }
        });

        if (response.data.resultados?.length > 0) {
            await db.formasPagamento.bulkPut(
                response.data.resultados.map((f) => ({
                    id:        f.id.toString(),
                    descricao: f.descricao,
                }))
            );
            logSync('SUCCESS', 'Formas Pgto OK.');
        }
    } catch (error) {
        logSync('ERROR', 'Erro Pull Formas Pgto', error);
    }
};

const pullPrazosPagamento = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        logSync('STEP', 'PULL: PRAZOS PGTO');

        const response = await apiClient.get<{ resultados: any[] }>('/financ_prazo_pgto', {
            params: { page_size: 9999 }
        });

        const res = response.data.resultados ||[];

        if (res.length > 0) {
            await db.prazosPagamento.clear();
            await db.prazosPagamento.bulkPut(
                res.map((p) => ({
                    id:             p.id.toString(),
                    descricao:      p.descricao,
                    parcelas:       Number(p.qtde) || 1,
                    dias_intervalo: Number(p.dias_intervalo) || 30,
                    desconto:       p.desconto || '0',
                    juros:          p.juros    || '0',
                }))
            );
            logSync('SUCCESS', 'Prazos OK.');
        }
    } catch (error) {
        logSync('ERROR', 'Erro Pull Prazos', error);
    }
};

const pullPdvSettings = async () => {
    try {
        const userStr = localStorage.getItem('currentUser');

        if (!userStr) {
            return;
        }

        const user         = JSON.parse(userStr);
        const operadorId   = user.pessoa_id;
        const systemUserId = user.id;

        logSync('STEP', 'PULL: CONFIGURAÇÕES DE PONTO (PDV)');

        const response = await apiClient.get<{ resultados: any[] }>('/fatur_pdv_pontos', {
            params: {
                integrador: 'fv',
                ativo:      1,
                page_size:  100,
                _cacheBust: Date.now(),
            }
        });

        const todosPontos = response.data.resultados ||[];

        const pontoEncontrado = todosPontos.find((p) => {
            const pOpId  = Number(p.pessoa_operador_id);
            const pSysId = Number(p.system_user_id);
            const uOpId  = Number(operadorId);
            const uSysId = Number(systemUserId);

            if (uSysId && pSysId === uSysId) return true;
            if (uOpId  && pOpId  === uOpId)  return true;
            return false;
        });

        await db.pdvSettings.clear();
        localStorage.removeItem('pdv_active_settings');

        if (pontoEncontrado) {
            const setting: PdvSetting = {
                id:                   pontoEncontrado.id,
                descricao:            pontoEncontrado.descricao,
                ativo:                pontoEncontrado.ativo || 1,
                finalidade:           pontoEncontrado.finalidade || 'faturamento',
                system_user_id:       pontoEncontrado.system_user_id,
                pessoa_operador_id:   pontoEncontrado.pessoa_operador_id,
                pessoa_unidade_id:    pontoEncontrado.pessoa_unidade_id,
                pessoa_cliente_id:    pontoEncontrado.pessoa_cliente_id || 0,

                produto_tabela_id:    pontoEncontrado.produto_tabela_id,
                financ_conta_id:      pontoEncontrado.financ_conta_id,
                fatur_operacao_id:    pontoEncontrado.fatur_operacao_id,
                estoque_setor_id:     pontoEncontrado.estoque_setor_id,
                financ_forma_pgto_id: pontoEncontrado.financ_forma_pgto_id,
                financ_prazo_pgto_id: pontoEncontrado.financ_prazo_pgto_id,
                fatur_serie_id:       pontoEncontrado.fatur_serie_id,
                tributo_tab_cfop_id:  pontoEncontrado.tributo_tab_cfop_id,

                fatur_operacao:    pontoEncontrado.fatur_operacao    ?? null,
                tributo_tab_cfop:  pontoEncontrado.tributo_tab_cfop  ?? null,
                financ_conta:      pontoEncontrado.financ_conta      ?? null,
                fatur_serie:       pontoEncontrado.fatur_serie        ?? null,
                estoque_setor:     pontoEncontrado.estoque_setor      ?? null,
                financ_forma_pgto: pontoEncontrado.financ_forma_pgto  ?? null,
                financ_prazo_pgto: pontoEncontrado.financ_prazo_pgto  ?? null,
            };

            await db.pdvSettings.put(setting);
            localStorage.setItem('pdv_active_settings', JSON.stringify(setting));
            logSync('SUCCESS', `✅ Ponto salvo: ID ${pontoEncontrado.id} — ${pontoEncontrado.descricao}`);
        } else {
            logSync('WARNING', `⚠️ Nenhum Ponto vinculado ao operador ${operadorId} / system_user ${systemUserId}.`);
        }

    } catch (error) {
        logSync('ERROR', 'API de Pontos falhou.', error);
    }
};

const pullTributoRegraPiscofins = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        let page          = 1;
        const PAGE_SIZE   = 100;
        let hasMore       = true;
        let totalImported = 0;

        logSync('STEP', 'PULL: TRIBUTO REGRA PIS/COFINS (PDV=1)');
        await db.tributoRegraPiscofins.clear();

        while (hasMore) {
            const response = await apiClient.get<PagedWaveResponse<any>>('/tributo_regra_piscofins', {
                params: {
                    pesquisa:   'pdv:1',
                    page,
                    page_size:  PAGE_SIZE,
                    limit:      PAGE_SIZE,
                    _cacheBust: Date.now(),
                }
            });

            const res = response.data.resultados ||[];

            if (res.length === 0) {
                hasMore = false;
                break;
            }

            const pdvRules = res.filter((r: any) => Number(r.pdv) === 1);

            const forDb = pdvRules.map((r: any) => ({
                id:                                 r.id,
                descricao:                          r.descricao ?? '',
                piscofins:                          r.piscofins ?? 'pis',
                tipo:                               r.tipo ?? 'entrada',
                saida_piscofins_aliq:               Number(r.saida_piscofins_aliq) ?? 0,
                saida_tributo_tab_piscofins_cst_id: r.saida_tributo_tab_piscofins_cst_id
                    ? Number(r.saida_tributo_tab_piscofins_cst_id)
                    : undefined,
                ativo: r.ativo ?? 1,
            }));

            if (forDb.length > 0) {
                await db.tributoRegraPiscofins.bulkPut(forDb);
                totalImported += forDb.length;
            }

            const totalPaginasPis = (response.data as any).total_paginas ?? null;

            if (totalPaginasPis !== null && page >= totalPaginasPis) hasMore = false;
            else if (res.length < PAGE_SIZE) hasMore = false;
            else page++;
        }

        logSync('SUCCESS', `Tributo PIS/COFINS: ${totalImported} regras para PDV.`);

    } catch (error) {
        logSync('ERROR', 'Erro Pull Tributo PIS/COFINS', error);
    }
};

const pullTributoRegraIcmsSt = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        let page          = 1;
        const PAGE_SIZE   = 100;
        let hasMore       = true;
        let totalImported = 0;

        logSync('STEP', 'PULL: TRIBUTO REGRA ICMS ST (PDV=1)');
        await db.tributoRegraIcmsSt.clear();

        while (hasMore) {
            const response = await apiClient.get<PagedWaveResponse<any>>('/tributo_regra_icms_st', {
                params: {
                    pesquisa:   'pdv:1',
                    page,
                    page_size:  PAGE_SIZE,
                    limit:      PAGE_SIZE,
                    _cacheBust: Date.now(),
                }
            });

            const res = response.data.resultados ||[];

            if (res.length === 0) {
                hasMore = false;
                break;
            }

            const pdvRules = res.filter((r: any) => Number(r.pdv) === 1);

            const forDb = pdvRules.map((r: any) => ({
                id:                                      r.id,
                descricao:                               r.descricao ?? '',
                tipo:                                    r.tipo ?? 'entrada',
                saida_icms_aliq:                         Number(r.saida_icms_aliq) ?? 0,
                saida_st_mva:                            Number(r.saida_st_mva) ?? 0,
                saida_tributo_tab_icms_st_cst_id:        r.saida_tributo_tab_icms_st_cst_id
                    ? Number(r.saida_tributo_tab_icms_st_cst_id)
                    : undefined,
                saida_icms_modalidade:                   r.saida_icms_modalidade,
                saida_st_modalidade:                     r.saida_st_modalidade,
                saida_tributo_tab_icms_st_origem_cst_id: r.saida_tributo_tab_icms_st_origem_cst_id
                    ? Number(r.saida_tributo_tab_icms_st_origem_cst_id)
                    : undefined,
                ativo: r.ativo ?? 1,
            }));

            if (forDb.length > 0) {
                await db.tributoRegraIcmsSt.bulkPut(forDb);
                totalImported += forDb.length;
            }

            const totalPaginasIcms = (response.data as any).total_paginas ?? null;

            if (totalPaginasIcms !== null && page >= totalPaginasIcms) hasMore = false;
            else if (res.length < PAGE_SIZE) hasMore = false;
            else page++;
        }

        logSync('SUCCESS', `Tributo ICMS ST: ${totalImported} regras para PDV.`);

    } catch (error) {
        logSync('ERROR', 'Erro Pull Tributo ICMS ST', error);
    }
};

const pullLocalLogradouroTipos = async () => {
    try {
        if (!getCurrentUserToken() || !db.localLogradouroTipos) {
            return;
        }

        let page          = 1;
        const PAGE_SIZE   = 1000;
        let hasMore       = true;
        let totalImported = 0;

        logSync('STEP', 'PULL: TIPOS DE LOGRADOURO');
        await db.localLogradouroTipos.clear();

        while (hasMore) {
            const response = await apiClient.get<PagedWaveResponse<any>>('/locais_logradouros_tipos', {
                params: {
                    page,
                    page_size:  PAGE_SIZE,
                    limit:      PAGE_SIZE,
                    _cacheBust: Date.now(),
                }
            });

            const res = response.data.resultados ||[];

            if (res.length === 0) {
                hasMore = false;
                break;
            }

            await db.localLogradouroTipos.bulkPut(
                res.map((r: any) => ({
                    id:        Number(r.id),
                    descricao: r.descricao,
                    sigla:     r.sigla,
                    ativo:     Number(r.ativo),
                }))
            );
            totalImported += res.length;

            const totalPaginasLograd = (response.data as any).total_paginas ?? null;

            if (totalPaginasLograd !== null && page >= totalPaginasLograd) hasMore = false;
            else if (res.length < PAGE_SIZE) hasMore = false;
            else page++;
        }

        logSync('SUCCESS', `Tipos de Logradouro: ${totalImported} registros.`);

    } catch (error) {
        logSync('ERROR', 'Erro Pull Tipos de Logradouro', error);
    }
};

const pullFaturSeries = async () => {
    try {
        if (!getCurrentUserToken()) {
            return;
        }

        logSync('STEP', 'PULL: SÉRIES DE FATURAMENTO');

        const response = await apiClient.get<{ resultados: any[] }>('/fatur_serie', {
            params: {
                page_size:  999,
                ativo:      1,
                _cacheBust: Date.now(),
            }
        });

        const res = response.data.resultados ||[];

        if (res.length > 0) {
            await db.faturSeries.clear();
            await db.faturSeries.bulkPut(
                res.map((s: any) => ({
                    id:        Number(s.id),
                    descricao: s.descricao,
                    serie:     s.serie,
                    modelo:    s.modelo,
                    ativo:     s.ativo === true || s.ativo === 1 ? 1 : 0,
                }))
            );
            logSync('SUCCESS', `Séries: ${res.length} registros.`);
        } else {
            logSync('WARNING', 'Nenhuma série de faturamento encontrada.');
        }
    } catch (error) {
        logSync('ERROR', 'Erro Pull Séries', error);
    }
};

// ==============================================================================
// RUN INITIAL SYNC
// ==============================================================================
export const runInitialSync = async () => {
    console.group('🚀 SYNC INICIAL DO SISTEMA');

    try {
        if (!getCurrentUserToken()) {
            logSync('WARNING', 'Usuário não autenticado. Pulando sincronização inicial.');
            return;
        }

        const isReallyOnline = await checkRealInternet();

        if (!isReallyOnline) {
            logSync('WARNING', '🚫 runInitialSync abortado: sem internet real. Dados locais preservados.');
            console.groupEnd();
            return;
        }

        logSync('STEP', 'Iniciando sincronização...');

        await pullAllProductsAndPrices();
        await pullPromocoes();
        await pullCustomers();
        await pullFiliais();
        await pullPriceTables();
        await pullFormasPagamento();
        await pullPrazosPagamento();
        await pullPdvSettings();
        await pullTributoRegraPiscofins();
        await pullTributoRegraIcmsSt();
        await pullLocalLogradouroTipos();
        await pullFaturSeries();

        const countProdutos  = await db.products.count();
        const countClientes  = await db.customers.count();
        const countFiliais   = await db.filiais.count();
        const countTabelas   = await db.priceTables.count();
        const countFormas    = await db.formasPagamento.count();
        const countPrazos    = await db.prazosPagamento.count();
        const countPdv       = await db.pdvSettings.count();
        const countPiscofins = await db.tributoRegraPiscofins.count();
        const countIcmsSt    = await db.tributoRegraIcmsSt.count();
        const countLograd    = await db.localLogradouroTipos?.count() ?? 0;
        const countSeries    = await db.faturSeries?.count()          ?? 0;

        logSync('SUCCESS', 'Todos os dados base foram sincronizados.');
        logSync('INFO',
            `Resumo: Prod=${countProdutos}, Cli=${countClientes}, Fil=${countFiliais}, ` +
            `Tab=${countTabelas}, F.Pgto=${countFormas}, P.Pgto=${countPrazos}, PDV=${countPdv}, ` +
            `PIS/COFINS=${countPiscofins}, ICMS=${countIcmsSt}, Lograd=${countLograd}, Séries=${countSeries}`
        );

    } catch (error) {
        logSync('ERROR', 'FALHA FATAL NO SYNC INICIAL', error);

        await Promise.all([
            db.products.clear(),
            db.customers.clear(),
            db.filiais.clear(),
            db.priceTables.clear(),
            db.formasPagamento.clear(),
            db.prazosPagamento.clear(),
            db.pdvSettings.clear(),
            db.tributoRegraPiscofins.clear(),
            db.tributoRegraIcmsSt.clear(),
            db.localLogradouroTipos?.clear(),
            db.faturSeries?.clear(),
        ]);

        throw error;

    } finally {
        console.groupEnd();
    }
};