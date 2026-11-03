'use client';
import { SITE } from '@/lib/site';
import { sb } from './cliente';

/** Calls the admin-ia edge function with the logged-in admin's session. */
export async function chamarAdmin(body) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch(`${SITE.supabaseUrl}/functions/v1/admin-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: SITE.supabaseKey },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || 'falha');
  return j;
}

export const fone = (w) => String(w || '').replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
export const soNumeros = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d && d.length <= 11 ? '55' + d : d;
};
export const dataHora = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const dataCurta = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
export const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
export const diaLongo = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' });
/** datetime-local value (BRT) <-> ISO */
export const paraLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 16) : '');
export const deLocal = (v) => (v ? new Date(`${v}:00-03:00`).toISOString() : null);

export const STATUS_VISITA = {
  solicitada: ['Aguardando você', 's-reservado'],
  confirmada: ['Confirmada', 's-disponivel'],
  realizada: ['Realizada', 's-vendido'],
  recusada: ['Recusada', 's-oculto'],
  cancelada: ['Cancelada', 's-rascunho'],
};
export const CANAIS = ['Chat do site', 'WhatsApp', 'Instagram', 'Indicação', 'Portal', 'Telefone', 'Placa', 'Formulário do site', 'Outro'];

export const FAIXAS = {
  quente: ['Quente', 't-quente', 'Contato hoje. Proponha visita em até 48h e mande a curadoria em 24h.'],
  morno: ['Morno', 't-morno', 'Follow-up a cada 3 ou 4 dias. Avance o que falta (crédito, prazo) e ofereça a curadoria.'],
  frio: ['Frio', 't-frio', 'A cada 2 semanas: imóvel novo que combine ou conteúdo útil. Descubra o prazo real.'],
  gelado: ['Gelado', 't-gelado', 'Uma vez por mês. Se ele voltar a interagir, o termômetro sobe sozinho.'],
  encerrado: ['Encerrado', 't-encerrado', ''],
};
export const PRAZOS = [['ate_3m', 'Até 3 meses'], ['3_6m', '3 a 6 meses'], ['6_12m', '6 a 12 meses'], ['mais_12m', 'Mais de 12 meses'], ['pesquisando', 'Só pesquisando']];
export const CREDITOS = [['aprovado', 'Crédito aprovado'], ['a_vista', 'À vista'], ['fgts_entrada', 'FGTS + entrada definida'], ['vai_financiar', 'Vai financiar (sem simulação)'], ['nao_sabe', 'Não sabe ainda']];

/** Calls the "app" edge function (notifications and voice log) with the admin session. */
export async function chamarApp(body) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch(`${SITE.supabaseUrl}/functions/v1/app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: SITE.supabaseKey },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || 'falha');
  return j;
}
export const URL_APP = `${SITE.supabaseUrl}/functions/v1/app`;
