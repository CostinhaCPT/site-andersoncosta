import Link from 'next/link';
import Perguntas from '@/components/Perguntas';
import { SITE } from '@/lib/site';

const URL = '/investir-em-imoveis-no-litoral-sc/';
export const metadata = {
  title: 'Corretor para investir em imóveis no litoral de SC',
  description: `Investimento em imóveis em Itapema e Porto Belo com acompanhamento de perto: confiro a obra, a documentação da incorporação e o histórico da construtora. Atendo compradores de todo o Brasil e do exterior. ${SITE.creci}.`,
  alternates: { canonical: URL },
};

const CONFIRO = [
  ['Registro da incorporação', 'Imóvel na planta só pode ser vendido com a incorporação registrada no cartório de imóveis. Eu peço a certidão e confiro se o que está sendo vendido bate com o memorial.'],
  ['Histórico da construtora', 'Obras entregues, atrasos, processos e como ela atendeu quem já comprou. Uma construtora boa em Balneário pode nunca ter entregue nada em Porto Belo.'],
  ['Obra de verdade', 'Vou até o canteiro e comparo o que está pronto com o cronograma prometido. Você recebe fotos e vídeo, não só o material de lançamento.'],
  ['Contrato e correção', 'Como o saldo é corrigido durante a obra (normalmente pelo INCC), o que acontece se atrasar, se o empreendimento tem patrimônio de afetação e quais custos ficam com o comprador.'],
  ['Preço contra a região', 'Comparo o valor do m² com lançamentos e usados parecidos na mesma faixa de praia. Num mercado caro, pagar a mais na entrada é o risco mais comum.'],
  ['Custo de manter', 'Condomínio, IPTU, mobília e administração de aluguel por temporada entram na conta antes, e não depois da compra.'],
];

const PERGUNTAS = [
  ['Você atende quem mora em outro estado ou fora do Brasil?', 'Sim. A maior parte de quem investe no litoral catarinense mora longe. Faço as conversas por vídeo, envio fotos e vídeos da obra e do imóvel, e organizo a assinatura dos documentos à distância quando a construtora e o cartório aceitam. Quando a presença é necessária, combinamos uma procuração.'],
  ['Estrangeiro pode comprar imóvel no Brasil?', 'Em área urbana, sim. É preciso ter CPF, que pode ser pedido inclusive nos consulados do Brasil no exterior. Para o pagamento vindo de fora, oriento a falar com o seu banco sobre o registro da remessa.'],
  ['Você garante rentabilidade ou valorização?', 'Não. Ninguém pode garantir retorno de imóvel. O que eu faço é mostrar os números de forma honesta, apontar os riscos e conferir pessoalmente o que dá para conferir antes de você assinar.'],
  ['Por que comprar com um corretor de Jaraguá do Sul?', 'Porque eu vou pessoalmente ao litoral, que fica a cerca de uma hora e meia daqui, e acompanho a compra do começo ao fim. Você tem um só profissional responsável, com registro no CRECI de Santa Catarina, onde o imóvel está.'],
  ['Quanto custa o seu acompanhamento para quem compra?', 'Para o comprador não há custo: a comissão de corretagem é paga pelo vendedor ou pela incorporadora, como é o padrão do mercado.'],
  ['Atende só Itapema e Porto Belo?', 'Meu foco no litoral são Itapema e Porto Belo. Para outras cidades de Santa Catarina, me conta o que você procura e eu digo com sinceridade se consigo te atender bem.'],
];

export default function Pagina() {
  return (<>
    <section className="hero escuro"><div className="wrap">
      <span className="eyebrow">Itapema · Porto Belo · {SITE.creci}</span>
      <h1>Investir em imóveis no litoral de Santa Catarina, com alguém olhando de perto</h1>
      <p className="lead">Investir em imóvel, em qualquer lugar, exige conhecimento e acompanhamento real para preservar o patrimônio. Eu vou pessoalmente ao litoral e confiro tudo, da obra à documentação da construtora ou incorporadora. Atendo compradores de todo o Brasil e do exterior.</p>
      <div className="acoes">
        <a href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent('Olá, Anderson! Quero conversar sobre investir em imóvel no litoral de SC.')}`} className="btn btn-claro" target="_blank" rel="noopener">Conversar sobre o seu investimento</a>
      </div>
    </div></section>

    <section className="sec"><div className="wrap duas-col">
      <div>
        <h2>Um mercado caro pede mais cuidado, não menos</h2>
        <p>Itapema e Balneário Camboriú aparecem há anos entre as cidades com o metro quadrado mais caro do país no <a href="https://www.fipe.org.br/pt-br/indices/fipezap/" target="_blank" rel="noopener">Índice FipeZAP</a>. Quando o preço já está alto, o ganho do investidor depende de comprar certo: a obra certa, da construtora certa, pelo preço certo.</p>
        <p>É aí que entra o meu trabalho. Não vendo o lançamento da vez; mostro as opções que passam pela minha conferência e explico por que as outras ficaram de fora.</p>
      </div>
      <div>
        <h2>Para quem é</h2>
        <p>Para quem quer um imóvel no litoral para renda de aluguel, para valorização de longo prazo ou para usar com a família, e prefere ter um corretor responsável pela compra, e não só um vendedor de empreendimento.</p>
        <p><Link href="/perguntas/vale-a-pena-comprar-imovel-na-planta/">Vale a pena comprar imóvel na planta?</Link> · <Link href="/perguntas/estrangeiro-pode-comprar-imovel-no-brasil/">Estrangeiro pode comprar imóvel no Brasil?</Link></p>
        <p>Também atendo quem quer comprar para morar em <Link href="/corretor-de-imoveis-jaragua-do-sul/">Jaraguá do Sul e região</Link>.</p>
      </div>
    </div></section>

    <section className="sec cinza-bg"><div className="wrap">
      <h2>O que eu confiro antes de você investir</h2>
      <div className="passos" style={{ marginTop: 24 }}>
        {CONFIRO.map(([t, d], k) => (
          <div key={t} className="passo"><span className="n">{String(k + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></div>
        ))}
      </div>
      <p className="nota" style={{ marginTop: 16 }}>Venda de imóvel na planta: <a href="https://www.planalto.gov.br/ccivil_03/leis/l4591.htm" target="_blank" rel="noopener">Lei 4.591/1964</a> (incorporações) e <a href="https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.931.htm" target="_blank" rel="noopener">Lei 10.931/2004</a> (patrimônio de afetação).</p>
    </div></section>

    <section className="sec"><div className="wrap duas-col">
      <div>
        <h2>Comprando de longe, passo a passo</h2>
        <ol className="lp-lista">
          <li>Uma conversa por vídeo para entender o objetivo, o prazo e o quanto você quer investir.</li>
          <li>Uma seleção curta, com os números e os pontos de atenção de cada opção, por escrito.</li>
          <li>Visita à obra ou ao imóvel comigo, presencial ou por vídeo ao vivo.</li>
          <li>Conferência da documentação antes da proposta.</li>
          <li>Acompanhamento até a assinatura e, na planta, até a entrega.</li>
        </ol>
      </div>
      <div>
        <h2>O que eu não faço</h2>
        <p>Não prometo rentabilidade, não indico imóvel que não conferi e não empurro o empreendimento que paga mais comissão. Se a conta não fecha, eu digo.</p>
      </div>
    </div></section>

    <section className="sec cinza-bg"><div className="wrap" style={{ maxWidth: 820 }}>
      <Perguntas itens={PERGUNTAS} url={URL} />
    </div></section>

    <section className="sec escuro lp-cta"><div className="wrap">
      <h2>Vamos olhar o seu investimento com calma</h2>
      <p className="lead" style={{ maxWidth: 560, color: '#d6d6d6' }}>Me conta de onde você está, o que busca no litoral e o prazo. Eu respondo pessoalmente.</p>
      <div className="acoes" style={{ justifyContent: 'center' }}><a href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent('Olá, Anderson! Quero conversar sobre investir em imóvel no litoral de SC.')}`} className="btn btn-claro" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
    </div></section>

    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'Service', '@id': SITE.dominio + URL + '#servico', name: 'Assessoria para investir em imóveis no litoral de Santa Catarina', serviceType: 'Corretagem de imóveis para investimento', provider: { '@id': SITE.dominio + '/#anderson' }, areaServed: ['Itapema', 'Porto Belo'].map((c) => ({ '@type': 'City', name: c, containedInPlace: { '@type': 'State', name: 'Santa Catarina' } })), audience: { '@type': 'Audience', geographicArea: { '@type': 'Place', name: 'Brasil e exterior' } } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: SITE.dominio + '/' }, { '@type': 'ListItem', position: 2, name: 'Investir em imóveis no litoral de SC', item: SITE.dominio + URL }] },
    ] }) }} />
  </>);
}
