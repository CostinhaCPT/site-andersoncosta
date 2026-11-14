import Link from 'next/link';
import Card from '@/components/Card';
import BuscaHome from '@/components/BuscaHome';
import CuradoriaCurta from '@/components/CuradoriaCurta';
import { imoveis } from '@/lib/imoveis';
import { BAIRROS_M2, FONTE_M2 } from '@/lib/bairros-m2';
import { brl, num, miniatura } from '@/lib/format';
import { SITE } from '@/lib/site';
export const metadata = { alternates: { canonical: '/' } };

const unicos = (k, n) => [...new Map(imoveis.map((i) => [i[k], i[n]])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

export default function Home() {
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const livre = (i) => i && !i.reservado;
  // As 3 da vitrine: as escolhidas em SITE.vitrine; se alguma saiu do ar, entram destaques próprios
  const vitrine = SITE.vitrine.map((c) => porCodigo.get(c)).filter(livre);
  for (const i of imoveis.filter((x) => (x.destaque || /^AC-/.test(x.codigo)) && livre(x)).sort((a, b) => (b.preco || 0) - (a.preco || 0))) {
    if (vitrine.length >= 3) break;
    if (!vitrine.includes(i)) vitrine.push(i);
  }
  // Uma foto por dia, em rodízio (o site é gerado de novo todo dia, então a troca acontece sozinha)
  const capasOk = SITE.capas.map(([c, n]) => [porCodigo.get(c), n]).filter(([i, n]) => livre(i) && i.fotos[n]);
  const [capa, nCapa] = capasOk.length ? capasOk[Math.floor((Date.now() - 3 * 36e5) / 864e5) % capasOk.length] : [vitrine[0], 0];
  const fotoCapa = capa?.fotos[nCapa];
  const bairrosComImovel = new Set(imoveis.filter((i) => i.cidadeSlug === 'jaragua-do-sul').map((i) => i.bairroSlug));
  return (
    <>
      <section className="h-hero">
        <div className="wrap h-hero-grade">
          <div className="h-hero-texto">
            <span className="eyebrow">Jaraguá do Sul e região · {SITE.creci}</span>
            <h1>Os 3 imóveis certos para a sua família. E eu na visita, do seu lado.</h1>
            <p className="lead">Antes de você sair de casa, comparo o preço com o bairro e te conto o que cada imóvel tem de bom e o que merece atenção. Na visita, estou lá.</p>
            <BuscaHome tipos={unicos('tipoSlug', 'tipo')} bairros={unicos('bairroSlug', 'bairro')} />
            <Link href="/curadoria/" className="link-forte">Prefere que eu procure por você? Receba sua curadoria gratuita →</Link>
          </div>
          {capa && (
            <Link href={`/imovel/${capa.slug}/`} className="h-hero-foto">
              <img src={fotoCapa} srcSet={`${miniatura(fotoCapa)} 540w, ${fotoCapa} 1200w`} sizes="(max-width: 960px) 100vw, 560px" alt={capa.titulo} width="1200" height="1600" fetchPriority="high" decoding="async" />
              <span className="h-hero-legenda">
                <span><small>{capa.bairro} · Selecionada por mim</small><b>{capa.titulo}</b></span>
                {capa.precoVisivel && capa.preco ? <b className="num">{brl(capa.preco)}</b> : null}
              </span>
            </Link>
          )}
        </div>
      </section>

      <section className="h-provas">
        <div className="wrap">
          <div><b>Visita sempre comigo</b><span>Nada de chave na portaria nem desconhecido abrindo a porta.</span></div>
          <div><b>Preço comparado ao bairro</b><span>O m² de cada imóvel contra a mediana da região.</span></div>
          <div><b>O que pesa, por escrito</b><span>Cada ficha diz o que é bom e o que merece atenção.</span></div>
          <div><b className="num">{imoveis.length} imóveis acompanhados</b><span>Os meus e os de corretores parceiros, num só lugar.</span></div>
        </div>
      </section>

      <section className="sec2 fundo-papel">
        <div className="wrap">
          <div className="sec2-topo">
            <div><span className="eyebrow">Selecionados por mim</span><h2>Três imóveis que eu mostraria hoje</h2></div>
            <Link href="/imoveis/" className="link-forte">Ver os {imoveis.length} imóveis →</Link>
          </div>
          <div className="grade3 trilho-celular">
            {vitrine.map((i) => <Card key={i.codigo} i={i} atencao unica />)}
          </div>
        </div>
      </section>

      <section className="sec2">
        <div className="wrap h-metodo">
          <img src={capa ? capa.fotos[Math.min(3, capa.fotos.length - 1)] : '/img/anderson-escritorio.webp'} alt="" loading="lazy" decoding="async" width="1200" height="1600" />
          <div>
            <span className="eyebrow">Método Compra Segura</span>
            <h2>Você visita menos e decide com mais certeza</h2>
            <ol className="passos2">
              <li><span className="num">01</span><div><b>Curadoria</b><p>Você me conta como é a sua rotina. Eu filtro tudo o que está à venda e trago só os 3 que fazem sentido.</p></div></li>
              <li><span className="num">02</span><div><b>Análise de compra</b><p>Preço do m² contra o bairro, o que é bom e o que pesa, por escrito, antes de você sair de casa.</p></div></li>
              <li><span className="num">03</span><div><b>Visita comigo</b><p>Eu vou junto, mostro o que olhar e respondo na hora. A negociação também fica comigo.</p></div></li>
            </ol>
            <Link href="/metodo-compra-segura/" className="link-forte">Como funciona em detalhe →</Link>
          </div>
        </div>
      </section>

      <section className="sec2 fundo-papel">
        <div className="wrap h-quem">
          <img src="/img/anderson-sofa-2.webp" alt="Anderson Costa, corretor de imóveis em Jaraguá do Sul" loading="lazy" decoding="async" width="1067" height="1600" />
          <div>
            <span className="eyebrow">Quem vai com você</span>
            <p className="citacao">“Eu só te levo a um imóvel que eu mesmo já olhei com cuidado. Se tiver algo que pesa, você vai saber antes.”</p>
            <p>Sou o Anderson Costa, corretor em Jaraguá do Sul. Trabalhei quase 20 anos com vendas e marketing antes de escolher os imóveis. Hoje acompanho cada família de perto, da curadoria à escritura.</p>
            <p className="muted">{SITE.creci} · Jaraguá do Sul e região</p>
            <Link href="/sobre/" className="link-forte">Conheça minha história →</Link>
          </div>
        </div>
      </section>

      <section className="sec2">
        <div className="wrap">
          <div className="sec2-topo">
            <div><span className="eyebrow">Bairros</span><h2>Quanto custa o m² em cada bairro</h2></div>
            <p className="nota" style={{ maxWidth: 380 }}>{FONTE_M2}</p>
          </div>
          <div className="bairros-m2">
            {BAIRROS_M2.map(([nome, slug, m2]) => {
              const tem = bairrosComImovel.has(slug);
              const Tag = tem ? Link : 'div';
              return (
                <Tag key={slug} {...(tem ? { href: `/imoveis/jaragua-do-sul/${slug}/` } : {})}>
                  <b>{nome}</b><span className="num">R$ {num(m2)}</span><small>por m²{tem ? ' · ver imóveis →' : ''}</small>
                </Tag>
              );
            })}
            <Link href="/curadoria/" className="bairros-m2-outro"><b>Seu bairro não está aqui?</b><small>Me pergunta. Eu levanto os números para você.</small></Link>
          </div>
        </div>
      </section>

      <section className="sec2 escuro">
        <div className="wrap h-curadoria">
          <div>
            <span className="eyebrow">Curadoria gratuita</span>
            <h2>Me conta o que sua família precisa. Eu te mando os 3 imóveis certos.</h2>
            <p className="muted">Sem compromisso e sem lista de 40 opções. Se nada fizer sentido agora, eu te aviso quando aparecer.</p>
          </div>
          <CuradoriaCurta />
        </div>
      </section>

      <section className="faixa-captacao">
        <div className="wrap">
          <div>
            <span className="eyebrow">Para proprietários</span>
            <p>Quer vender? Te mostro com dados do seu bairro quanto o seu imóvel vale hoje e como eu divulgaria.</p>
          </div>
          <Link href="/anuncie-seu-imovel/" className="btn btn-claro">Quanto vale meu imóvel</Link>
        </div>
      </section>
    </>
  );
}
