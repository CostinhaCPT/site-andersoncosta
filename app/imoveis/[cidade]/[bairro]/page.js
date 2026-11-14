import Link from 'next/link';
import Card from '@/components/Card';
import { imoveis, bairros } from '@/lib/imoveis';
import { brl, num } from '@/lib/format';
import { SITE } from '@/lib/site';
import { BAIRROS_M2 } from '@/lib/bairros-m2';
export function generateStaticParams() { return bairros().map((b) => ({ cidade: b.cidadeSlug, bairro: b.bairroSlug })); }
// Referência de preço por m² separada por tipo, e só quando a amostra é do próprio bairro
function refs(l) {
  const vistos = new Map();
  for (const i of l) if (i.refAmostra && !vistos.has(i.tipoSlug === 'apartamento')) vistos.set(i.tipoSlug === 'apartamento', i.refM2);
  const t = [...vistos].map(([apto, v]) => `${apto ? 'apartamentos' : 'casas e geminados'} ${brl(v)}/m²`);
  return t.length ? ` Referência no bairro: ${t.join('; ')}.` : '';
}
const achar = (p) => bairros().find((b) => b.cidadeSlug === p.cidade && b.bairroSlug === p.bairro);
export async function generateMetadata({ params }) { const b = achar(await params); return { title: `Imóveis à venda no ${b.bairro}, ${b.cidade}`, description: `Casas, geminados e apartamentos à venda no ${b.bairro}, ${b.cidade}, com preço por m², simulação de financiamento e pontos de atenção de cada imóvel.`, alternates: { canonical: `/imoveis/${b.cidadeSlug}/${b.bairroSlug}/` } }; }
export default async function Pagina({ params }) {
  const b = achar(await params);
  const l = imoveis.filter((i) => i.cidadeSlug === b.cidadeSlug && i.bairroSlug === b.bairroSlug).sort((x, y) => x.preco - y.preco);
  const m2 = b.cidadeSlug === 'jaragua-do-sul' ? BAIRROS_M2.find(([, s]) => s === b.bairroSlug) : null;
  const url = `${SITE.dominio}/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`;
  return (
    <section className="cat"><div className="wrap">
      <div className="migalha"><Link href="/imoveis/">Imóveis</Link> / {b.cidade} / {b.bairro}</div>
      <div className="cat-topo">
      <span className="eyebrow">{b.cidade}</span>
      <h1>Imóveis no {b.bairro}</h1>
      <p className="muted">{l.length} imóve{l.length === 1 ? 'l' : 'is'} à venda, {l.length === 1 ? `por ${brl(l[0].preco)}` : `de ${brl(l[0].preco)} a ${brl(l[l.length - 1].preco)}`}.{refs(l)}</p>
      {m2 && <p className="nota">Mediana do m² de apartamentos anunciados no {b.bairro}: R$ {num(m2[2])} (A Corrida dos Bairros, setembro de 2026).</p>}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Imóveis', item: `${SITE.dominio}/imoveis/` }, { '@type': 'ListItem', position: 2, name: `${b.bairro}, ${b.cidade}`, item: url }] },
        { '@type': 'ItemList', name: `Imóveis à venda no ${b.bairro}, ${b.cidade}`, numberOfItems: l.length, itemListElement: l.slice(0, 30).map((i, k) => ({ '@type': 'ListItem', position: k + 1, url: `${SITE.dominio}/imovel/${i.slug}/`, name: i.titulo })) },
      ] }) }} />
      <div className="grade3">{l.map((i) => <Card key={i.codigo} i={i} />)}</div>
    </div></section>
  );
}
