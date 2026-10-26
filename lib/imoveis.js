import dados from '@/data/imoveis.json';
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
    .map((i) => ({ i, d: Math.abs(i.preco - im.preco) / im.preco + (i.bairroSlug === im.bairroSlug ? -0.3 : 0) + (i.tipo === im.tipo ? -0.1 : 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.i);
