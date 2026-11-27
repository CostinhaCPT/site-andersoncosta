import Link from 'next/link';
import LinkWhats from '@/components/LinkWhats';
import { notFound } from 'next/navigation';
import Perguntas from '@/components/Perguntas';
import { perguntas, porSlugP, mesAno } from '@/lib/perguntas';
import { SITE } from '@/lib/site';

export const dynamicParams = false;
export const generateStaticParams = () => perguntas().map((p) => ({ slug: p.slug }));
export function generateMetadata({ params }) {
  const p = porSlugP(params.slug);
  if (!p) return {};
  return { title: p.titulo, description: p.resumo, alternates: { canonical: `/perguntas/${p.slug}/` } };
}

const Celula = ({ c }) => (c && typeof c === 'object' ? <Link href={c.href}>{c.t}</Link> : c);

export default function Pagina({ params }) {
  const p = porSlugP(params.slug);
  if (!p) notFound();
  const url = `/perguntas/${p.slug}/`;
  const rel = (p.rel || []).map((s) => porSlugP(s)).filter(Boolean);
  const wa = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(`Olá, Anderson! Li "${p.pergunta}" no seu site e quero conversar.`)}`;
  return (<>
    <section className="hero escuro"><div className="wrap">
      <span className="eyebrow">Atualizado em {mesAno()} · {SITE.creci}</span>
      <h1>{p.pergunta}</h1>
      <p className="lead">{p.resposta}</p>
    </div></section>

    {p.secoes.map((s, k) => (
      <section key={s.t} className={`sec${k % 2 ? ' cinza-bg' : ''}`}><div className="wrap" style={{ maxWidth: 820 }}>
        <h2>{s.t}</h2>
        {s.tabela && (
          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table className="tabela-m2" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{s.tabela.cab.map((c, i) => <th key={c} style={{ textAlign: i ? 'right' : 'left', padding: '8px 10px 8px 0', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
              <tbody>{s.tabela.linhas.map((l, r) => (
                <tr key={r} style={{ borderTop: '1px solid var(--linha)' }}>{l.map((c, i) => <td key={i} style={{ textAlign: i ? 'right' : 'left', padding: '8px 10px 8px 0' }} className={i ? 'num' : undefined}><Celula c={c} /></td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(s.p || []).map((t, i) => <p key={i} style={{ marginTop: 14 }}>{t}</p>)}
        {s.lista && <ul className="lp-lista" style={{ marginTop: 14 }}>{s.lista.map((t) => <li key={t}>{t}</li>)}</ul>}
      </div></section>
    ))}

    <section className="sec"><div className="wrap" style={{ maxWidth: 820 }}>
      <Perguntas itens={p.faq} url={url} titulo="Outras dúvidas sobre o assunto" />
      {p.nota && <p className="nota" style={{ marginTop: 20 }}>{p.nota}</p>}
      <h3 style={{ marginTop: 28 }}>Fontes</h3>
      <ul className="nota" style={{ marginTop: 8, paddingLeft: 18 }}>{p.fontes.map((f) => <li key={f.t}>{f.u ? <a href={f.u} target="_blank" rel="noopener">{f.t}</a> : f.t}</li>)}</ul>
      {rel.length > 0 && <>
        <h3 style={{ marginTop: 28 }}>Veja também</h3>
        <ul className="lp-lista" style={{ marginTop: 8 }}>{rel.map((r) => <li key={r.slug}><Link href={`/perguntas/${r.slug}/`}>{r.pergunta}</Link></li>)}</ul>
      </>}
    </div></section>

    <section className="sec escuro lp-cta"><div className="wrap">
      <h2>{p.cta.texto}</h2>
      <p className="lead" style={{ maxWidth: 560, color: '#d6d6d6' }}>Eu respondo pessoalmente, com os números do seu caso.</p>
      <div className="acoes" style={{ justifyContent: 'center' }}>
        <Link href={p.cta.href} className="btn btn-claro">Começar</Link>
        <LinkWhats href={wa} className="btn btn-borda" local="pergunta">Falar no WhatsApp</LinkWhats>
      </div>
    </div></section>

    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'Article', '@id': SITE.dominio + url + '#artigo', headline: p.pergunta, description: p.resumo, inLanguage: 'pt-BR', dateModified: new Date().toISOString().slice(0, 10), mainEntityOfPage: SITE.dominio + url, author: { '@id': SITE.dominio + '/#pessoa' }, publisher: { '@id': SITE.dominio + '/#anderson' } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: SITE.dominio + '/' }, { '@type': 'ListItem', position: 2, name: 'Perguntas', item: SITE.dominio + '/perguntas/' }, { '@type': 'ListItem', position: 3, name: p.pergunta, item: SITE.dominio + url }] },
    ] }) }} />
  </>);
}
