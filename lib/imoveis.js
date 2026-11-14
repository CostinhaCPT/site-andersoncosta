import dados from '@/data/imoveis.json';
import geo from '@/data/bairros-geo.json';
import { miniatura } from '@/lib/format';
export const imoveis = dados.filter((i) => !i.oculto);
export const porSlug = (s) => imoveis.find((i) => i.slug === s);
export const bairros = () => {
  const m = new Map();
  for (const i of imoveis) {
    const k = i.cidadeSlug + '/' + i.bairroSlug;
    if (!m.has(k)) m.set(k, { cidade: i.cidade, cidadeSlug: i.cidadeSlug, bairro: i.bairro, bairroSlug: i.bairroSlug, total: 0 });
    m.get(k).total++;
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
};
export const semelhantes = (im, n = 3) =>
  imoveis
    .filter((i) => i.codigo !== im.codigo)
    .map((i) => ({ i, d: Math.abs((i.preco || 0) - (im.preco || 0)) / (im.preco || 1) + (i.bairroSlug === im.bairroSlug ? -0.3 : 0) + (i.tipo === im.tipo ? -0.1 : 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.i);
const chaveGeo = Object.fromEntries(Object.entries(geo).map(([k, v]) => [k.replace(/ /g, '-'), v]));
// Pontos do mapa: um por bairro (nunca o endereço do imóvel), com faixa de preço e 3 miniaturas
export const bairrosMapa = () => {
  const m = new Map();
  for (const i of imoveis) {
    const k = i.cidadeSlug + '|' + i.bairroSlug;
    const c = chaveGeo[k]; if (!c) continue;
    if (!m.has(k)) m.set(k, { bairro: i.bairro, cidade: i.cidade, url: `/imoveis/${i.cidadeSlug}/${i.bairroSlug}/`, lat: c[0], lng: c[1], total: 0, min: null, max: null, fotos: [] });
    const b = m.get(k); b.total++;
    if (i.precoVisivel && i.preco) { b.min = b.min == null ? i.preco : Math.min(b.min, i.preco); b.max = b.max == null ? i.preco : Math.max(b.max, i.preco); }
    if (b.fotos.length < 3 && i.fotos[0]) b.fotos.push(miniatura(i.fotos[0]));
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
};

// Só o que o card e os filtros usam (a lista inteira com descrições pesava ~1 MB no celular)
export const paraCard = (i, fotos = 8) => ({ codigo: i.codigo, slug: i.slug, titulo: i.titulo, tipo: i.tipo, tipoSlug: i.tipoSlug, bairro: i.bairro, bairroSlug: i.bairroSlug, cidade: i.cidade, cidadeSlug: i.cidadeSlug, preco: i.preco, precoVisivel: i.precoVisivel, area: i.area, terreno: i.terreno, quartos: i.quartos, suites: i.suites, vagas: i.vagas, fotos: i.fotos.slice(0, fotos), reservado: i.reservado, destaque: i.destaque, criadoEm: i.criadoEm, faixa: i.faixa });
