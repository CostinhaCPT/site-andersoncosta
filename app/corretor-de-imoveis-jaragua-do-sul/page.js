import Link from 'next/link';
import Perguntas from '@/components/Perguntas';
import { imoveis, bairros } from '@/lib/imoveis';
import { BAIRROS_M2, FONTE_M2 } from '@/lib/bairros-m2';
import { brl, num } from '@/lib/format';
import { SITE } from '@/lib/site';

const URL = '/corretor-de-imoveis-jaragua-do-sul/';
export const metadata = {
  title: 'Corretor de imóveis em Jaraguá do Sul',
  description: `Anderson Costa, corretor de imóveis em Jaraguá do Sul (${SITE.creci}). Compra e venda de casas, geminados e apartamentos com o preço do m² comparado ao bairro, os pontos de atenção por escrito e a visita sempre comigo.`,
  alternates: { canonical: URL },
};

const REGIAO = ['Guaramirim', 'Schroeder', 'Corupá', 'Massaranduba'];

const PERGUNTAS = [
  ['Quanto custa contratar um corretor de imóveis para comprar em Jaraguá do Sul?', 'Para quem compra, o meu trabalho não tem custo: a curadoria, a análise de preço e as visitas são gratuitas. A comissão de corretagem é paga pelo vendedor, como é o padrão do mercado.'],
  ['Como confirmo que um corretor de imóveis é registrado?', `Todo corretor precisa de registro ativo no CRECI do estado. Em Santa Catarina, a consulta é pública no site do CRECI-SC, pelo nome ou pelo número. O meu registro é ${SITE.creci}.`],
  ['Você mostra imóveis de outras imobiliárias?', 'Sim. Além dos imóveis do meu catálogo, trabalho em parceria com outros corretores e imobiliárias da região. O que importa é achar o imóvel certo para a família, não o imóvel de quem anuncia.'],
  ['Atende quem está se mudando para Jaraguá do Sul vindo de outra cidade?', 'Sim, e é um dos atendimentos que mais faço. Começo explicando os bairros pela rotina da família (trabalho, escola, trânsito), faço a primeira conversa por vídeo e organizo as visitas para concentrar tudo em poucos dias.'],
  ['Você trabalha com locação?', 'Não. Atendo só compra e venda, para poder me dedicar a cada negociação do começo ao fim.'],
  ['Por que o endereço do imóvel não aparece no anúncio?', 'Porque a visita é sempre comigo. Assim eu apresento o imóvel e o bairro pessoalmente, mostro o que é bom e o que pesa, e protejo a segurança do proprietário.'],
  ['Quero vender meu imóvel. Como funciona a avaliação?', 'Eu comparo o seu imóvel com os anúncios e as vendas parecidas no mesmo bairro e te entrego uma faixa de preço por escrito, sem custo. A partir daí você decide se quer anunciar comigo.'],
];

export default function Pagina() {
  const daCidade = imoveis.filter((i) => i.cidadeSlug === 'jaragua-do-sul');
  const precos = daCidade.filter((i) => i.precoVisivel && i.preco).map((i) => i.preco).sort((a, b) => a - b);
  const bairrosJgua = bairros().filter((b) => b.cidadeSlug === 'jaragua-do-sul');
  const regiao = REGIAO.map((c) => {
    const l = imoveis.filter((i) => i.cidade === c);
    const bs = bairros().filter((b) => b.cidade === c);
    return { cidade: c, total: l.length, bairros: bs };
  });
  return (<>
    <section className="hero escuro"><div className="wrap">
      <span className="eyebrow">{SITE.creci}</span>
      <h1>Corretor de imóveis em Jaraguá do Sul</h1>
      <p className="lead">Sou Anderson Costa e ajudo famílias a comprar e vender casas, geminados e apartamentos em Jaraguá do Sul e região. Antes de qualquer visita, você recebe o preço do m² comparado ao bairro e o que merece atenção em cada imóvel, por escrito.</p>
      <div className="acoes">
        <Link href="/curadoria/" className="btn btn-claro">Receba sua curadoria gratuita</Link>
        <a href={`https://wa.me/${SITE.whatsapp}`} className="btn btn-borda" target="_blank" rel="noopener">Falar no WhatsApp</a>
      </div>
    </div></section>

    <section className="sec"><div className="wrap duas-col">
      <div>
        <h2>O que eu faço por quem compra</h2>
        <p>Comprar o imóvel certo em Jaraguá passa por três perguntas: o bairro combina com a rotina da família, o preço está justo para aquele bairro e o que o anúncio não conta. Eu respondo as três antes de você sair de casa.</p>
        <p>Hoje são {daCidade.length} imóveis à venda em Jaraguá do Sul no meu catálogo{precos.length ? `, de ${brl(precos[0])} a ${brl(precos[precos.length - 1])}` : ''}, em {bairrosJgua.length} bairros, além dos que chegam pelas parcerias e ainda não estão no site.</p>
        <p><Link href="/metodo-compra-segura/">Veja como funciona o Método Compra Segura</Link></p>
      </div>
      <div>
        <h2>O que eu faço por quem vende</h2>
        <p>Avaliação por escrito com base nos imóveis parecidos do mesmo bairro, fotos tratadas, anúncio no site e nas redes e atendimento filtrado: só levo para visitar quem já conversou comigo e tem condição real de comprar.</p>
        <p><Link href="/anuncie-seu-imovel/">Quero saber quanto vale meu imóvel</Link></p>
      </div>
    </div></section>

    <section className="sec cinza-bg"><div className="wrap">
      <h2>Quanto custa o m² em cada bairro de Jaraguá do Sul</h2>
      <p className="muted" style={{ maxWidth: 680 }}>É a primeira conta que eu faço com cada cliente: se o imóvel está acima ou abaixo do que o bairro costuma pedir.</p>
      <table className="tabela-m2" style={{ marginTop: 20, width: '100%', maxWidth: 560, borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: '8px 0' }}>Bairro</th><th style={{ textAlign: 'right', padding: '8px 0' }}>Mediana do m²</th></tr></thead>
        <tbody>{BAIRROS_M2.map(([n, s, v]) => (
          <tr key={s} style={{ borderTop: '1px solid var(--linha)' }}>
            <td style={{ padding: '8px 0' }}>{bairrosJgua.some((b) => b.bairroSlug === s) ? <Link href={`/imoveis/jaragua-do-sul/${s}/`}>{n}</Link> : n}</td>
            <td style={{ textAlign: 'right', padding: '8px 0' }} className="num">R$ {num(v)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="nota" style={{ marginTop: 12 }}>{FONTE_M2}</p>
    </div></section>

    <section className="sec"><div className="wrap">
      <h2>Bairros com mais imóveis à venda</h2>
      <p style={{ marginTop: 12, lineHeight: 2 }}>{bairrosJgua.slice(0, 16).map((b, k) => (
        <span key={b.bairroSlug}>{k ? ' · ' : ''}<Link href={`/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`}>{b.bairro} ({b.total})</Link></span>
      ))}</p>
      <h2 style={{ marginTop: 48 }}>Também atendo a região</h2>
      <div className="passos" style={{ marginTop: 20 }}>
        {regiao.map((r) => (
          <div key={r.cidade} className="passo">
            <h3>Corretor de imóveis em {r.cidade}</h3>
            <p>{r.total ? `${r.total} imóve${r.total === 1 ? 'l' : 'is'} à venda hoje` : 'Atendo compra e venda'}, com a mesma análise de preço e a visita comigo.</p>
            {r.bairros.length > 0 && <p style={{ fontSize: '.92rem' }}>{r.bairros.slice(0, 5).map((b, k) => <span key={b.bairroSlug}>{k ? ' · ' : ''}<Link href={`/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`}>{b.bairro}</Link></span>)}</p>}
          </div>
        ))}
      </div>
    </div></section>

    <section className="sec cinza-bg"><div className="wrap duas-col">
      <div>
        <h2>Como escolher um corretor de imóveis</h2>
        <p>Seja comigo ou com outro profissional, vale conferir cinco coisas antes de começar:</p>
        <ol className="lp-lista">
          <li>Registro ativo no CRECI, com nome e número (a consulta é pública no site do CRECI-SC).</li>
          <li>Se ele explica o preço com dados do bairro, e não só com a opinião dele.</li>
          <li>Se aponta os defeitos do imóvel antes da visita.</li>
          <li>Se deixa claro quem paga a comissão e quanto.</li>
          <li>O que dizem os clientes atendidos por ele.</li>
        </ol>
      </div>
      <div>
        <h2>Comprando de outra cidade ou do exterior</h2>
        <p>Muita gente que compra em Jaraguá ainda mora em outro lugar. A primeira conversa é por vídeo, a seleção chega por escrito e as visitas ficam concentradas em poucos dias. Também atendo quem quer investir no litoral de Santa Catarina.</p>
        <p><Link href="/investir-em-imoveis-no-litoral-sc/">Investir em imóveis no litoral de SC</Link></p>
      </div>
    </div></section>

    <section className="sec"><div className="wrap" style={{ maxWidth: 820 }}>
      <Perguntas itens={PERGUNTAS} url={URL} />
    </div></section>

    <section className="sec escuro lp-cta"><div className="wrap">
      <h2>Me conta o que a sua família precisa</h2>
      <p className="lead" style={{ maxWidth: 560, color: '#d6d6d6' }}>Em uma conversa curta eu entendo a rotina de vocês e te mando os imóveis que fazem sentido, com os números de cada um.</p>
      <div className="acoes" style={{ justifyContent: 'center' }}><Link href="/curadoria/" className="btn btn-claro">Receba sua curadoria gratuita</Link></div>
    </div></section>

    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebPage', '@id': SITE.dominio + URL, url: SITE.dominio + URL, name: 'Corretor de imóveis em Jaraguá do Sul', about: { '@id': SITE.dominio + '/#anderson' }, inLanguage: 'pt-BR' },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: SITE.dominio + '/' }, { '@type': 'ListItem', position: 2, name: 'Corretor de imóveis em Jaraguá do Sul', item: SITE.dominio + URL }] },
    ] }) }} />
  </>);
}
