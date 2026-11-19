import Link from 'next/link';
import { perguntas } from '@/lib/perguntas';
import { SITE } from '@/lib/site';

const URL = '/perguntas/';
export const metadata = {
  title: 'Perguntas sobre comprar imóvel em Jaraguá do Sul e no litoral de SC',
  description: `Respostas diretas, com números do catálogo e fontes, sobre preço de casas e apartamentos em Jaraguá do Sul, financiamento, imóvel na planta e investimento no litoral de Santa Catarina. ${SITE.creci}.`,
  alternates: { canonical: URL },
};

export default function Pagina() {
  const todas = perguntas();
  const grupos = [['Jaraguá do Sul e região', 'jaragua'], ['Litoral de Santa Catarina e investimento', 'litoral']];
  return (<>
    <section className="hero escuro"><div className="wrap">
      <span className="eyebrow">{SITE.creci}</span>
      <h1>Perguntas sobre comprar imóvel em Jaraguá do Sul e no litoral de SC</h1>
      <p className="lead">São as perguntas que mais aparecem nas buscas e nas conversas com quem compra. Cada resposta traz o número do meu catálogo do dia ou a fonte oficial, e diz o que ainda precisa ser conferido no seu caso.</p>
    </div></section>
    {grupos.map(([nome, chave]) => (
      <section key={chave} className="sec"><div className="wrap" style={{ maxWidth: 820 }}>
        <h2>{nome}</h2>
        <ul className="lp-lista" style={{ marginTop: 16 }}>
          {todas.filter((p) => p.regiao === chave).map((p) => (
            <li key={p.slug}><Link href={`/perguntas/${p.slug}/`}><b>{p.pergunta}</b></Link><br /><span className="muted">{p.resumo}</span></li>
          ))}
        </ul>
      </div></section>
    ))}
    <section className="sec escuro lp-cta"><div className="wrap">
      <h2>Não achou a sua pergunta?</h2>
      <p className="lead" style={{ maxWidth: 560, color: '#d6d6d6' }}>Me conta o que você quer saber e eu respondo pessoalmente, com os números do seu caso.</p>
      <div className="acoes" style={{ justifyContent: 'center' }}><a href={`https://wa.me/${SITE.whatsapp}`} className="btn btn-claro" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
    </div></section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'CollectionPage', '@id': SITE.dominio + URL, url: SITE.dominio + URL, name: 'Perguntas sobre comprar imóvel em Jaraguá do Sul e no litoral de SC', inLanguage: 'pt-BR', about: { '@id': SITE.dominio + '/#anderson' } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: SITE.dominio + '/' }, { '@type': 'ListItem', position: 2, name: 'Perguntas', item: SITE.dominio + URL }] },
    ] }) }} />
  </>);
}
