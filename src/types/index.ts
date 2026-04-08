// src/types/index.ts

export interface Product {
  id: string;
  sku: string;
  name: string;
  marca: string;

  /** Preço normal em centavos (preco_venda * 100). */
  price: number;

  /** Desconto fixo em centavos aplicado sobre price (campo desconto da API * 100). */
  desconto: number;

  stock: number;
  produto_unidade_id?: number;
  produto_tabela_id: string;
  tributo_tab_classfiscal_id?: number;

  /** Custo de venda em reais (não em centavos — enviado diretamente para a API). */
  custo_venda?: number;

  /**
   * Preço promocional em centavos (preco_promocao * 100).
   * Quando > 0 e dentro da validade_promocao, substitui `price` no carrinho.
   * Undefined = sem promoção configurada.
   */
  preco_promocao?: number;

  /**
   * Data de validade da promoção no formato "YYYY-MM-DD" (ou ISO completo).
   * String vazia ou undefined = promoção por tempo indeterminado (sempre ativa).
   */
  validade_promocao?: string;
}

export interface Customer {
  id: string;
  name: string;
  document: string;
  fantasia?: string;
  fone1?: string;
  email?: string;
  cadastro?: string;

  // CAMPOS DE ENDEREÇO PARA A NF
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  complemento?: string;
  local_municipio_id?: number;
  local_uf_id?: number;
  local_pais_id?: number;
  local_logradouro_tipo_id?: number;
}

export interface Filial {
  id: string;
  descricao: string;
  nome_fantasia?: string;
}

export interface TabelaPreco {
  id: string;
  descricao: string;
}

export interface FormaPagamento {
  id: string;
  descricao: string;
}

export interface PrazoPagamento {
  id: string;
  descricao: string;
  parcelas: number;
  dias_intervalo: number;
  desconto: string;
  juros: string;
}

export interface TransactionItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  desconto: number;
  produto_unidade_id?: number;
  tributo_tab_classfiscal_id?: number;
  /** Custo de venda em reais, carregado do Dexie no momento da venda. */
  custo_venda?: number;
}

export interface TituloFinanceiro {
  pedido_id: number;
  financ_forma_pgto_id: number;
  parcela: number;
  valor: number;
  vencimento: string;
  historico: string;
  recebimento: string;
}

export interface Transaction {
  clientTransactionId: string;
  operatorId: string;
  customer: Customer;
  cpfCnpjNota?: string;
  filialId: string;
  table_id: string;
  formaPagamentoId: string;
  prazoPagamentoId: string;
  fatur_serie_id?: number;
  prazoPagamento: PrazoPagamento;
  finalidade: string;
  items: TransactionItem[];
  totalCents: number;
  createdAt: string;
  synced: 0 | 1;
  status: 'pending' | 'sincronizando' | 'confirmed' | 'failed';
  serverTransactionId?: string;
  lastError?: string;
  /**
   * URL do cupom/DANFE gerada após emissão da NF-e via /fatur_pdv_cupom.
   * Preenchida automaticamente ao final do fluxo de faturamento.
   */
  url_cupom?: string;
}

export interface FaturSerie {
  id: number;
  descricao: string;
  serie: string;
  modelo?: string;
  ativo: number;
}

export interface User {
  id: number;
  uuid: string;
  pessoa_id: number;
  pessoa_unidade_id: number;
  descricao: string;
  login: string;
  cpf_cnpj: string;
  unidade_cpf_cnpj: string;
  host_https?: string;
}

export interface TributoTabCfop {
  id: number;
  codigo: string;
  descricao: string;
  aplicacao?: string;
  origem_destino?: string;
  st?: string;
  ignorar_estoque?: boolean;
  ignorar_financeiro?: boolean;
  ativo?: boolean;
}

export interface FaturOperacao {
  id: number;
  descricao: string;

  /** Natureza da operação, ex: 'VENDA', 'DEVOLUCAO' */
  natureza: string;

  /** Tipo de fluxo: 'saida' | 'entrada' */
  tipo: string;

  /** Finalidade fiscal: 'normal' | 'complementar' | 'ajuste' | 'devolucao' */
  finalidade: string;

  /** Indica se a operação gera movimento financeiro (títulos a receber/pagar) */
  financeiro: boolean;

  /** Tipo de movimentação de estoque: 'saida' | 'entrada' | 'nenhum' */
  estoque: string;

  /** Indica se a operação gera tributação fiscal */
  tributar: boolean;

  /** ID do Plano de Contas para rateio automático dos títulos financeiros gerados */
  financ_plano_id?: number;

  /** ID do Centro de Custo para rateio automático dos títulos financeiros gerados */
  financ_cent_custo_id?: number;

  /** ID do Setor de Estoque padrão vinculado à operação */
  estoque_setor_id?: number;

  /** ID da Forma de Pagamento padrão da operação */
  financ_forma_pgto_id?: number;

  /** ID do Prazo de Pagamento padrão da operação */
  financ_prazo_pgto_id?: number;

  /** ID da Tabela de Preços padrão da operação */
  produto_tabela_id?: number;

  /** Tratamento do custo de venda do ICMS: 'somar' | 'deduzir' | 'nenhum' */
  custo_venda_icms?: string;

  ativo?: boolean;
}

export interface PdvSetting {
  // --- Campos sempre presentes ---
  id: number;
  descricao: string;
  ativo: number;

  /**
   * Define o fluxo de venda do ponto: 'faturamento' gera NF-e via /fatur_nf;
   * qualquer outro valor usa o fluxo legado de pedido via /pedido.
   */
  finalidade: string;

  // --- Vínculos de operador/unidade ---
  system_user_id: number;
  pessoa_operador_id: number;
  pessoa_unidade_id: number;

  /**
   * ID do cliente padrão pré-selecionado no ponto (ex: consumidor final).
   * Valor 0 indica ausência — o operador seleciona o cliente manualmente.
   */
  pessoa_cliente_id: number;

  // --- IDs de configuração fiscal/financeira/estoque (opcionais) ---
  produto_tabela_id?: number;
  financ_conta_id?: number;
  fatur_operacao_id?: number;
  estoque_setor_id?: number;
  financ_forma_pgto_id?: number;
  financ_prazo_pgto_id?: number;
  fatur_serie_id?: number;
  tributo_tab_cfop_id?: number;

  // --- Objetos expandidos (opcionais, eager-loaded pela API) ---
  fatur_operacao?: FaturOperacao | null;
  tributo_tab_cfop?: TributoTabCfop | null;
  financ_conta?: any | null;
  fatur_serie?: any | null;
  estoque_setor?: any | null;
  financ_forma_pgto?: any | null;
  financ_prazo_pgto?: any | null;
}

export interface EstoqueMovimento {
  id: number;
  unidade_id: number;
  unidade: string;
  produto_id: number;
  produto: string;
  qtde_total: number;
  qtde_s_mvt: number;
  qtde_n_mvt: number;
  sigla: string;
  setor?: {
    id: number;
    pessoa_unidade_id: number;
    descricao: string;
    ativo: number;
  };
  produto_unidade?: {
    id: number;
    sigla: string;
    descricao: string;
    sigla_tributavel: string;
    fator: number;
    ativo: number;
  };
}

export interface TributoRegraPiscofins {
  id: number;
  descricao: string;
  piscofins: string;
  tipo: string;
  saida_piscofins_aliq: number;
  saida_tributo_tab_piscofins_cst_id?: number;
  ativo: number;
}

export interface TributoRegraIcmsSt {
  id: number;
  descricao: string;
  tipo: string;
  saida_icms_aliq: number;
  saida_st_mva: number;
  saida_tributo_tab_icms_st_cst_id?: number;
  saida_icms_modalidade?: string;
  saida_st_modalidade?: string;
  saida_tributo_tab_icms_st_origem_cst_id?: number;
  ativo: number;
}

export interface LocalLogradouroTipo {
  id: number;
  descricao: string;
  sigla: string;
  ativo: number;
}

// ==============================================================================
// RESPOSTA DOS ENDPOINTS DE CUPOM PDV
// ==============================================================================

/**
 * Resposta retornada pelos endpoints /fatur_pdv_cupom/*.
 * A API retorna uma string que pode ser:
 *   - JSON serializado com { url_file, status, ... }
 *   - Uma URL direta do arquivo de cupom
 *   - Um status textual (ex: "processando", "aguardando")
 */
export interface CupomNfResponse {
  /** URL do arquivo do cupom/DANFE para impressão. */
  url_file?: string;
  /** Status atual da emissão da NF-e. */
  status?: string;
  /** Mensagem descritiva retornada pela API de integração. */
  message?: string;
  [key: string]: any;
}