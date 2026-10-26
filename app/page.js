import Link from 'next/link';
import Card from '@/components/Card';
import FormLead from '@/components/FormLead';
import { imoveis, bairros } from '@/lib/imoveis';
import { SITE } from '@/lib/site';
export default function Home() {
  const dest = imoveis.filter((i) => i.destaque).concat(imoveis.filter((i) => !i.destaque)).slice(0, 6);
  return (
    <>
      <section className="hero escuro">
        
        <div className="wrap">
          <span className="eyebrow">Jaraguá do Sul e região · {SITE.creci}</span>
          <h1>Os imóveis certos para a sua família, sem dezenas de links</h1>
          <p className="lead">Você me conta o que precisa. Eu seleciono os 3 imóveis que fazem sentido, com análise de preço, custo total de compra e um vídeo honesto de cada um, com pontos fortes e pontos de atenção.</p>
          <div className="acoes">
            <Link href="/curadoria/" className="btn btn-claro">Receba sua curadoria gratuita</Link>
            <Link href="/imoveis/" className="btn btn-borda">Ver imóveis</Link>
          </div>
        </div>
      </section>

      <section className="sec escuro" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <span className="eyebrow">Método Compra Segura</span>
          <h2>Comprar bem é comparar com clareza</h2>
          <div className="passos">
            <div className="passo"><span className="n">01</span><h3>Curadoria</h3><p className="muted">Os 3 imóveis que combinam com a sua família, o seu orçamento e a sua rotina. Não uma lista sem fim.</p></div>
            <div className="passo"><span className="n">02</span><h3>Análise de compra</h3><p className="muted">Preço por m² comparado ao bairro, ITBI, escritura e registro, simulação de financiamento e checklist de documentos.</p></div>
            <div className="passo"><span className="n">03</span><h3>Vídeo honesto</h3><p className="muted">Um tour gravado por mim mostrando o que o imóvel tem de melhor e o que merece atenção antes da visita.</p></div>
          </div>
          <p style={{ marginTop: 28 }}><Link href="/metodo-compra-segura/" style={{ color: '#fff' }}>Entenda o método →</Link></p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <span className="eyebrow">Selecionados</span>
          <h2>Imóveis em destaque</h2>
          <div className="grade" style={{ marginTop: 28 }}>{dest.map((i) => <Card key={i.codigo} i={i} />)}</div>
          <p style={{ marginTop: 32, textAlign: 'center' }}><Link href="/imoveis/" className="btn btn-escuro">Ver todos os {imoveis.length} imóveis</Link></p>
        </div>
      </section>

      <section className="sec cinza-bg">
        <div className="wrap">
          <span className="eyebrow">Por bairro</span>
          <h2>Onde você quer morar?</h2>
          <div className="tags" style={{ marginTop: 20 }}>{bairros().map((b) => <Link key={b.bairroSlug} href={`/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`}>{b.bairro} ({b.total})</Link>)}</div>
        </div>
      </section>

      <section className="sec escuro">
        <div className="wrap duas-col">
          <div>
            <span className="eyebrow">Quem atende você</span>
            <h2>Anderson Costa</h2>
            <p className="muted">São quase 20 anos em marketing e vendas antes do mercado imobiliário. Trago essa experiência para o que importa na compra: entender o que a sua família precisa, comparar com números e ser transparente sobre cada imóvel.</p>
            <p><i>“{SITE.frase}”</i></p>
            <Link href="/sobre/" className="btn btn-borda" style={{ color: '#fff' }}>Conheça minha história</Link>
          </div>
          <img src="/img/anderson-praia-bracos.webp" alt="Anderson Costa, corretor de imóveis em Jaraguá do Sul" className="foto-anderson" loading="lazy" />
        </div>
      </section>

      <section className="sec">
        <div className="wrap duas-col">
          <div>
            <span className="eyebrow">Curadoria gratuita</span>
            <h2>Conte o que você procura</h2>
            <p className="muted">Em até um dia útil eu volto com os imóveis que fazem sentido, inclusive opções que não estão no site. Financiamento e permuta a gente conversa no WhatsApp.</p>
          </div>
          <FormLead titulo="" />
        </div>
      </section>
    </>
  );
}
