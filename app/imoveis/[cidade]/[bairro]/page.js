import Link from 'next/link';
import Card from '@/components/Card';
import { imoveis, bairros } from '@/lib/imoveis';
import { brl } from '@/lib/format';
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
  const l = imoveis.filter((i) => i.bairroSlug === b.bairroSlug).sort((x, y) => x.preco - y.preco);
  return (
    <section className="sec cinza-bg"><div className="wrap">
      <div className="migalha"><Link href="/imoveis/">Imóveis</Link> / {b.cidade} / {b.bairro}</div>
      <h1 style={{ marginTop: 16 }}>Imóveis no {b.bairro}</h1>
      <p className="muted">{l.length} imóve{l.length === 1 ? 'l' : 'is'} selecionado{l.length === 1 ? '' : 's'}, {l.length === 1 ? `por ${brl(l[0].preco)}` : `de ${brl(l[0].preco)} a ${brl(l[l.length - 1].preco)}`}.{refs(l)}</p>
      <div className="grade" style={{ marginTop: 28 }}>{l.map((i) => <Card key={i.codigo} i={i} />)}</div>
    </div></section>
  );
}
