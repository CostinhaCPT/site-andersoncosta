'use client';
import { sb, BUCKET, urlPublica } from '@/lib/admin/cliente';
import { SITE } from '@/lib/site';
import { deLocal } from '@/lib/admin/ia';

// ------------------------------------------------------------------ chamada à função "meta"
export async function meta(body) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch(`${SITE.supabaseUrl}/functions/v1/meta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: SITE.supabaseKey }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || 'falha');
  return j;
}

export async function enviarArquivo(id, nome, blob, tipo) {
  const caminho = `criativos/${id}/${nome}`;
  const { error } = await sb().storage.from(BUCKET).upload(caminho, blob, { contentType: tipo, upsert: true });
  if (error) throw error;
  return { url: urlPublica(caminho), caminho, tipo: tipo.startsWith('video') ? 'video' : 'imagem' };
}

/** Grava a peça. Modo "assistido" (com música): no horário o app avisa e o Anderson posta pelo Instagram. */
export async function salvarCriativo({ id, cod, tipo, titulo, arquivos, legenda, redes, modo, agora, quando, palavra_chave, resposta_dm, dados }) {
  const status = agora ? (modo === 'assistido' ? 'aguardando' : 'rascunho') : 'agendado';
  const linha = {
    id, imovel_codigo: cod, tipo, titulo, arquivos, legenda, modo, dados: dados || {},
    redes: tipo === 'story' || tipo === 'reel' ? ['instagram'] : redes,
    status, agendado_para: agora ? null : deLocal(quando), palavra_chave: palavra_chave || null, resposta_dm: resposta_dm || null,
  };
  const { error } = await sb().from('criativos').insert(linha);
  if (error) throw error;
  if (agora && modo === 'automatico') await meta({ acao: 'publicar', id });
  return linha;
}

