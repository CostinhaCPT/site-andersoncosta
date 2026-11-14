// Comparação justa de preço por m²: o imóvel contra outros parecidos de verdade.
// Antes, a ficha comparava com a mediana do bairro misturando casas, geminados, novos e usados,
// e uma casa com piscina e mobília aparecia "78% acima". Agora a régua é:
//   mesmo tipo (casa, geminado ou apartamento) + tamanho parecido + os mesmos atributos que pesam no preço
//   (piscina, mobília, imóvel novo), primeiro no bairro e, se a amostra for pequena, na cidade.
// E a ficha sempre mostra quais imóveis entraram na conta e o que explica a diferença.
import { imoveis } from '@/lib/imoveis';

const GRUPO = { casa: 'casa', sobrado: 'casa', 'casa-geminada': 'geminado', apartamento: 'apartamento' };
const NOME = { casa: ['casa', 'casas', 'casas parecidas'], geminado: ['geminado', 'geminados', 'geminados parecidos'], apartamento: ['apartamento', 'apartamentos', 'apartamentos parecidos'] };
const MIN = 4;
const texto = (i) => [i.titulo, i.resumo, ...(i.destaques || []), i.descricao].join(' ').toLowerCase();
export const ATRIBUTOS = {
  piscina: { nome: 'piscina', tem: (t) => /piscina/.test(t) && !/(espa[cç]o|quintal|lugar|preparad[oa]|pronto) (para|pra) (a )?piscina/.test(t) },
  mobiliado: { nome: 'mobília', tem: (t) => /mobiliad|porteira fechada|m[oó]veis (planejados|sob medida) (ficam|inclu)/.test(t) },
  altoPadrao: { nome: 'acabamento de alto padrão', tem: (t) => /alto padr[aã]o|alt[íi]ssimo padr[aã]o/.test(t) },
  novo: { nome: 'imóvel novo', tem: (t) => /\b(casa|im[oó]vel|geminado|apartamento|sobrado) nov[oa]\b|nunca habitad|rec[eé]m[- ]constru/.test(t) },
};
const atributos = (i) => { const t = texto(i); return Object.keys(ATRIBUTOS).filter((k) => ATRIBUTOS[k].tem(t)); };
const m2 = (i) => i.preco / i.area;
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

export function comparar(alvo) {
  const g = GRUPO[alvo.tipoSlug];
  if (!g || !alvo.area || !alvo.preco || !alvo.precoVisivel) return null;
  const meus = atributos(alvo);
  const base = imoveis.filter((i) => i.codigo !== alvo.codigo && GRUPO[i.tipoSlug] === g && i.cidadeSlug === alvo.cidadeSlug && i.precoVisivel && i.preco && i.area && i.area >= alvo.area * 0.65 && i.area <= alvo.area * 1.5);
  // da régua mais justa para a mais ampla: todos os atributos, depois tirando um de cada vez; bairro antes da cidade
  const subconj = [[]];
  for (const k of meus) for (const c of [...subconj]) subconj.push([...c, k]);
  subconj.sort((a, b) => b.length - a.length);
  const tentativas = [];
  for (const c of subconj) {
    const l = base.filter((i) => { const a = atributos(i); return c.every((k) => a.includes(k)); });
    tentativas.push({ l: l.filter((i) => i.bairroSlug === alvo.bairroSlug), onde: 'bairro', considera: c }, { l, onde: 'cidade', considera: c });
  }
  const t = tentativas.find((x) => x.l.length >= MIN);
  if (!t) return null;
  const ref = mediana(t.l.map(m2));
  const dif = Math.round(((m2(alvo) - ref) / ref) * 100);
  // O que ajuda a explicar a diferença: o que este imóvel tem e a maioria da amostra não tem
  const motivos = [];
  for (const k of meus) {
    if (t.considera.includes(k)) continue;
    const fatia = t.l.filter((i) => atributos(i).includes(k)).length / t.l.length;
    if (fatia < 0.5) motivos.push(`tem ${ATRIBUTOS[k].nome}, item que a maioria dos imóveis da comparação não informa`);
  }
  if (meus.includes('mobiliado')) motivos.push('a mobília que fica entra no preço, mas não na metragem');
  const areaMed = mediana(t.l.map((i) => i.area));
  if (alvo.area < areaMed * 0.85) motivos.push(`é menor que a média da comparação (${Math.round(alvo.area)} m² contra ${Math.round(areaMed)} m²): em imóveis menores, terreno, lazer e acabamento se dividem por menos metros e o m² sobe`);
  if (g !== 'apartamento' && alvo.terreno && alvo.area && alvo.terreno / alvo.area > 2.2) motivos.push(`o terreno é grande para a área construída (${Math.round(alvo.terreno)} m²)`);
  const exemplos = [...t.l].sort((a, b) => Math.abs(a.area - alvo.area) - Math.abs(b.area - alvo.area)).slice(0, 4)
    .map((i) => ({ codigo: i.codigo, slug: i.slug, titulo: i.titulo, bairro: i.bairro, area: i.area, preco: i.preco, m2: Math.round(m2(i)) }));
  const [um, varios, parecidos] = NOME[g];
  const filtro = [`${varios} de ${Math.round(alvo.area * 0.65)} a ${Math.round(alvo.area * 1.5)} m²`, ...t.considera.map((k) => `com ${ATRIBUTOS[k].nome}`)].join(', ');
  return {
    m2: Math.round(m2(alvo)), ref: Math.round(ref), dif, n: t.l.length, onde: t.onde, um, varios, parecidos, filtro, exemplos, motivos,
    // diferença acima de 50% quase sempre é metragem informada de outro jeito ou padrão muito diferente: não é veredito
    incerto: Math.abs(dif) > 50,
    ignorou: meus.filter((k) => !t.considera.includes(k)).map((k) => ATRIBUTOS[k].nome),
  };
}
