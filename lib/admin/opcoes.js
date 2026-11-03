export const STATUS = [
  ['rascunho', 'Rascunho', 'Não aparece no site'],
  ['disponivel', 'No site', 'Publicado e à venda'],
  ['reservado', 'Reservado', 'Aparece com selo de reservado'],
  ['vendido', 'Vendido', 'Sai do site'],
  ['oculto', 'Oculto', 'Sai do site sem marcar como vendido'],
];
export const TIPOS = [
  ['casa', 'Casa'], ['casa-geminada', 'Geminado'], ['sobrado', 'Sobrado'], ['apartamento', 'Apartamento'],
  ['cobertura', 'Cobertura'], ['terreno', 'Terreno'], ['chacara', 'Chácara'],
];
export const CIDADES = ['Jaraguá do Sul', 'Guaramirim', 'Schroeder', 'Corupá', 'Massaranduba', 'Pomerode', 'Rio dos Cedros', 'Joinville', 'Porto Belo', 'Itapema'];
export const ETAPAS = [
  ['novo', 'Novo'], ['em_conversa', 'Em conversa'], ['qualificado', 'Qualificado'], ['curadoria_enviada', 'Curadoria enviada'],
  ['visita_agendada', 'Visita agendada'], ['visita_realizada', 'Visita realizada'], ['proposta', 'Proposta'], ['venda', 'Venda'], ['perdido', 'Perdido'],
];
// Fallback price-per-m2 references (city medians from the tracked listings, out/2026)
export const REF_CIDADE = { apto: 8925, casa: 6125 };
export const grupo = (tipo) => (tipo === 'apartamento' || tipo === 'cobertura' ? 'apto' : 'casa');

const PARADAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'com', 'no', 'na', 'nos', 'nas', 'em', 'para', 'o', 'a', 'os', 'as', 'um', 'uma', 'ao']);
export const slugify = (s) => String(s || '').replace(/\s*m²/gi, 'm2').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !PARADAS.has(w)).join('-');
export function gerarSlug(titulo, cidade) {
  let s = slugify(titulo);
  const c = slugify(cidade || 'Jaraguá do Sul');
  if (s && !s.endsWith(c)) s += '-' + c;
  return s.slice(0, 100).replace(/-+$/, '');
}
// YouTube links become embeds; anything else is kept as typed
export function videoEmbed(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : u;
}
export const proximoCodigo = (lista) => {
  const n = Math.max(0, ...lista.map((i) => parseInt(String(i.codigo).replace(/\D/g, ''), 10) || 0));
  return 'AC-' + String(n + 1).padStart(4, '0');
};
