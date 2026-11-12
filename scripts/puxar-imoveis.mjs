// Pulls published listings from Supabase and writes data/imoveis.json before the build.
// Only rows the public (anon) role can read are published: status disponivel or reservado.
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const URL = 'https://ngvnlaxtstjqmsoillne.supabase.co';
const KEY = 'sb_publishable_Qy7wHs1xWDTsxJig2YztuQ_K3-drJXm';
const DESTINO = new globalThis.URL('../data/imoveis.json', import.meta.url);

import { mapearImovel } from '../lib/mapear.mjs';

const campos = 'codigo,slug,status,titulo,resumo,descricao,destaques,atencao,tipo,cidade,bairro,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,condominio,iptu,aceita_permuta,aceita_financiamento,fotos,video,ref_m2,ref_amostra,destaque,ordem,criado_em';
const r = await fetch(`${URL}/rest/v1/imoveis?select=${campos}&order=preco.asc`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!r.ok) {
  console.error('Supabase respondeu', r.status, await r.text());
  process.exit(process.env.CI ? 1 : 0); // locally keep the current file
}
const linhas = await r.json();
if (!linhas.length && process.env.CI) { console.error('Nenhum imóvel publicado; build interrompido por segurança.'); process.exit(1); }

const dados = linhas.map(mapearImovel).filter((i) => i.fotos.length && i.slug && i.titulo);

const json = JSON.stringify(dados, null, 1);
let anterior = '';
try { anterior = readFileSync(DESTINO, 'utf8'); } catch {}
writeFileSync(DESTINO, json);
const versao = createHash('sha256').update(json).digest('hex').slice(0, 16);
console.log(`${dados.length} imóveis publicados · versão ${versao}${anterior === json ? ' (sem mudanças)' : ''}`);
