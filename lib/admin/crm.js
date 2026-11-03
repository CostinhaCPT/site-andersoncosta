'use client';
import { ETAPAS } from './opcoes';

export const ETAPAS_CAPTACAO = [
  ['cap_contato', 'Primeiro contato'], ['cap_avaliacao', 'Avaliação marcada'], ['cap_acm', 'Avaliação (ACM) apresentada'],
  ['cap_negociacao', 'Negociando condições'], ['cap_autorizado', 'Autorização assinada'], ['cap_anunciado', 'Anunciado'],
  ['venda', 'Vendido'], ['perdido', 'Perdido'],
];
export const FUNIS = { compra: { nome: 'Compra', etapas: ETAPAS, inicial: 'novo' }, captacao: { nome: 'Captação', etapas: ETAPAS_CAPTACAO, inicial: 'cap_contato' } };
export const etapasDo = (funil) => (FUNIS[funil] || FUNIS.compra).etapas;
export const rotuloEtapa = (v) => ([...ETAPAS, ...ETAPAS_CAPTACAO].find((e) => e[0] === v) || [v, v])[1];

// Chance de fechar por etapa, para a previsão de comissão
export const PROBABILIDADE = {
  novo: 0.03, em_conversa: 0.05, qualificado: 0.1, curadoria_enviada: 0.15, visita_agendada: 0.25, visita_realizada: 0.35, proposta: 0.6,
  cap_contato: 0.05, cap_avaliacao: 0.15, cap_acm: 0.3, cap_negociacao: 0.45, cap_autorizado: 0.7, cap_anunciado: 0.8, venda: 1, perdido: 0,
};

export const PAPEIS = [['comprador', 'Comprador'], ['proprietario', 'Proprietário'], ['investidor', 'Investidor'], ['parceiro', 'Parceiro'], ['indicador', 'Indicou alguém']];
export const TIPOS_EMPRESA = [['holding', 'Holding / PJ do cliente'], ['construtora', 'Construtora'], ['imobiliaria', 'Imobiliária parceira'], ['parceiro', 'Parceiro (banco, cartório, advogado)'], ['outro', 'Outro']];
export const TIPOS_ATIVIDADE = [['nota', 'Nota'], ['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['reuniao', 'Reunião'], ['email', 'E-mail']];
export const TIPOS_TAREFA = [['tarefa', 'Tarefa'], ['ligar', 'Ligar'], ['whatsapp', 'Mandar WhatsApp'], ['email', 'Mandar e-mail'], ['visita', 'Visita'], ['documento', 'Documento']];

export const brl = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
export const numero = (v) => { const d = String(v ?? '').replace(/[^\d,]/g, '').replace(',', '.'); return d === '' ? null : Number(d); };
export const comissao = (n) => (n.valor ? Number(n.valor) * (Number(n.comissao_pct ?? 5) / 100) : 0);

/** Chave segura para um campo personalizado a partir do rótulo. */
export const chaveDe = (rotulo) => String(rotulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** CSV simples (separador ;) que abre certo no Excel em português. */
export function baixarCsv(nome, linhas, colunas) {
  const esc = (v) => { const s = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = '﻿' + [colunas.map((c) => c[1]).join(';'), ...linhas.map((l) => colunas.map((c) => esc(typeof c[0] === 'function' ? c[0](l) : l[c[0]])).join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Lê CSV com ; ou , e aspas. Devolve lista de objetos pelo cabeçalho. */
export function lerCsv(texto) {
  const t = texto.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) { if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; continue; }
    if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas.filter((l) => l.some((x) => x.trim()));
  if (!cab) return [];
  const chaves = cab.map((h) => chaveDe(h));
  return resto.map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? '').trim()])));
}
