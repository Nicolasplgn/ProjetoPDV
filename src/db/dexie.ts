// src/db/dexie.ts

import Dexie, { type Table } from 'dexie';
import type {
  Product, Transaction, Customer, TabelaPreco, Filial,
  FormaPagamento, PrazoPagamento, PdvSetting,
  TributoRegraPiscofins, TributoRegraIcmsSt, EstoqueMovimento,
  LocalLogradouroTipo,
  FaturSerie
} from '../types';

export class PDVDatabase extends Dexie {
  products!: Table<Product>;
  transactions!: Table<Transaction, string>;
  customers!: Table<Customer, string>;
  priceTables!: Table<TabelaPreco, string>;
  filiais!: Table<Filial, string>;
  formasPagamento!: Table<FormaPagamento, string>;
  prazosPagamento!: Table<PrazoPagamento, string>;
  pdvSettings!: Table<PdvSetting, number>;
  faturSeries!: Table<FaturSerie>;
  tributoRegraPiscofins!: Table<TributoRegraPiscofins, number>;
  tributoRegraIcmsSt!: Table<TributoRegraIcmsSt, number>;
  estoquesMovimentos!: Table<EstoqueMovimento, number>;
  localLogradouroTipos!: Table<LocalLogradouroTipo, number>;

  constructor() {
    super('PDVDatabase');

    // ===========================================================================
    // VERSÃO 20
    // Motivo: Product ganhou os campos preco_promocao e validade_promocao.
    // O Dexie persiste todos os campos do objeto independentemente do schema —
    // o schema apenas define índices. Portanto nenhum índice novo foi criado,
    // mas a bump de versão garante que o pull inicial seja re-executado e os
    // produtos sejam re-salvos com os novos campos mapeados do syncService.
    // ===========================================================================
    this.version(20).stores({
      products:              '&[id+produto_tabela_id], produto_tabela_id',
      transactions:          '&clientTransactionId, synced, status',
      customers:             '&id',
      priceTables:           '&id',
      filiais:               '&id',
      formasPagamento:       '&id',
      prazosPagamento:       '&id',
      pdvSettings:           '&id, system_user_id, pessoa_operador_id',
      tributoRegraPiscofins: '&id',
      tributoRegraIcmsSt:    '&id',
      estoquesMovimentos:    '&id, produto_id, unidade_id',
      localLogradouroTipos:  '&id',
      faturSeries:           'id, serie, ativo',
    });

    // VERSÃO 19: Adiciona tabela de tipos de logradouro
    this.version(19).stores({
      products:              '&[id+produto_tabela_id], produto_tabela_id',
      transactions:          '&clientTransactionId, synced, status',
      customers:             '&id',
      priceTables:           '&id',
      filiais:               '&id',
      formasPagamento:       '&id',
      prazosPagamento:       '&id',
      pdvSettings:           '&id, system_user_id, pessoa_operador_id',
      tributoRegraPiscofins: '&id',
      tributoRegraIcmsSt:    '&id',
      estoquesMovimentos:    '&id, produto_id, unidade_id',
      localLogradouroTipos:  '&id',
      faturSeries:           'id, serie, ativo',
    });

    // VERSÃO 18: Adiciona tabela de estoques movimentos
    this.version(18).stores({
      products:              '&[id+produto_tabela_id], produto_tabela_id',
      transactions:          '&clientTransactionId, synced, status',
      customers:             '&id',
      priceTables:           '&id',
      filiais:               '&id',
      formasPagamento:       '&id',
      prazosPagamento:       '&id',
      pdvSettings:           '&id, system_user_id, pessoa_operador_id',
      tributoRegraPiscofins: '&id',
      tributoRegraIcmsSt:    '&id',
      estoquesMovimentos:    '&id, produto_id, unidade_id',
    });

    // VERSÃO 17: Adiciona tabelas de regras tributárias
    this.version(17).stores({
      products:              '&[id+produto_tabela_id], produto_tabela_id',
      transactions:          '&clientTransactionId, synced, status',
      customers:             '&id',
      priceTables:           '&id',
      filiais:               '&id',
      formasPagamento:       '&id',
      prazosPagamento:       '&id',
      pdvSettings:           '&id, system_user_id, pessoa_operador_id',
      tributoRegraPiscofins: '&id',
      tributoRegraIcmsSt:    '&id',
    });

    this.version(16).stores({
      products:        '&[id+produto_tabela_id], produto_tabela_id',
      transactions:    '&clientTransactionId, synced, status',
      customers:       '&id',
      priceTables:     '&id',
      filiais:         '&id',
      formasPagamento: '&id',
      prazosPagamento: '&id',
      pdvSettings:     '&id, system_user_id, pessoa_operador_id',
    });

    this.version(15).stores({
      products:        '&[id+produto_tabela_id], produto_tabela_id',
      transactions:    '&clientTransactionId, synced, status',
      customers:       '&id',
      priceTables:     '&id',
      filiais:         '&id',
      formasPagamento: '&id',
      prazosPagamento: '&id',
      pdvSettings:     '&id, pessoa_operador_id',
    });

    this.version(14).stores({
      products:        '&[id+produto_tabela_id], produto_tabela_id',
      transactions:    '&clientTransactionId, synced, status',
      customers:       '&id',
      priceTables:     '&id',
      filiais:         '&id',
      formasPagamento: '&id',
      prazosPagamento: '&id',
    });

    this.version(13).stores({
      products:     '&[id+produto_tabela_id], produto_tabela_id',
      transactions: '&clientTransactionId, synced, status',
      customers:    '&id',
      priceTables:  '&id',
      filiais:      '&id',
    });

    this.version(12).stores({
      products:     '&id, price',
      transactions: '&clientTransactionId, synced, status',
      customers:    '&id',
      priceTables:  '&id',
      filiais:      '&id',
    });
  }
}

export const db = new PDVDatabase();