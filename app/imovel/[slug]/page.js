import Link from 'next/link';
import Galeria from '@/components/Galeria';
import Analise from '@/components/Analise';
import Card from '@/components/Card';
import { BotaoWhats } from '@/components/Whats';
import { imoveis, porSlug, semelhantes } from '@/lib/imoveis';
import { brl, num, miniatura } from '@/lib/format';
import { SITE } from '@/lib/site';
import ContarVisita from '@/components/ContarVisita';
export function generateStaticParams() { return imoveis.map((i) => ({ slug: i.slug })); }
export async function generateMetadata({ params }) {
  const i = porSlug((await params).slug);
  return { title: i.titulo, description: `${i.resumo} ${i.precoVisivel && i.preco ? brl(i.preco) : 'Preço sob consulta'}. ${i.bairro}, ${i.cidade}.`, alternates: { canonical: `/imovel/${i.slug}/` }, openGraph: { images: [miniatura(i.fotos[0])] } };
}
export default async function Pagina({ params }) {
  const i = porSlug((await params).slug);
  const msg = `Olá, Anderson! Vi o imóvel "${i.titulo}" (ref. ${i.codigo}) no site e quero saber mais.`;
  const ld = { '@context': 'https://schema.org', '@type': 'RealEstateListing', name: i.titulo, description: i.resumo, url: `${SITE.dominio}/imovel/${i.slug}/`, image: i.fotos.slice(0, 6).map((f) => (/^https?:/.test(f) ? f : SITE.dominio + f)),
    offers: { '@type': 'Offer', ...(i.precoVisivel && i.preco ? { price: i.preco, priceCurrency: 'BRL' } : {}), availability: i.reservado ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock', seller: { '@type': 'RealEstateAgent', name: SITE.marca, telephone: '+' + SITE.whatsapp, url: SITE.dominio } },
    mainEntity: { '@type': i.tipoSlug === 'apartamento' ? 'Apartment' : 'SingleFamilyResidence', numberOfBedrooms: i.quartos, numberOfBathroomsTotal: i.banheiros, ...(i.area ? { floorSize: { '@type': 'QuantitativeValue', value: i.area, unitCode: 'MTK' } } : {}), address: { '@type': 'PostalAddress', addressLocality: i.cidade, addressRegion: 'SC', addressCountry: 'BR' } } };
  const dif = i.precoM2 && i.refM2 && i.refAmostra ? Math.round(((i.precoM2 - i.refM2) / i.refM2) * 100) : 0;
  const bom = [...i.destaques, ...(dif <= -5 ? [`Preço ${Math.abs(dif)}% abaixo da mediana do m² do bairro`] : [])];
  const pesa = [...i.atencao, ...(dif >= 5 ? [`Preço ${dif}% acima da mediana do m² do bairro (veja a análise)`] : [])];
  return (
    <div className="pagina-imovel" data-codigo={i.codigo}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <ContarVisita codigo={i.codigo} titulo={i.titulo} valor={i.precoVisivel && i.preco ? i.preco : null} perfil={{ bairro: i.bairroSlug, tipo: i.tipoSlug, preco: i.preco }} />
      <div className="wrap">
        <div className="migalha"><Link href="/imoveis/">Imóveis</Link> / <Link href={`/imoveis/${i.cidadeSlug}/${i.bairroSlug}/`}>{i.bairro}</Link> / {i.codigo}</div>
        <Galeria fotos={i.fotos} titulo={i.titulo} video={i.video} />
        <div className="imovel-grid">
          <article>
            <span className="eyebrow">{i.tipo} · {i.bairro} · {i.cidade}</span>
            <h1 className="imovel-titulo">{i.titulo}</h1>
            <div className="preco-movel"><b className="num">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</b>{i.reservado && <span> · Reservado</span>}</div>
            <div className="ficha num">
              {i.area && <div><b>{num(i.area)} m²</b><span>{i.tipoSlug === 'apartamento' ? 'privativos' : 'construídos'}</span></div>}
              {i.terreno && <div><b>{num(i.terreno)} m²</b><span>de terreno</span></div>}
              {i.quartos > 0 && <div><b>{i.quartos}</b><span>quarto{i.quartos > 1 ? 's' : ''}</span></div>}
              {i.suites > 0 && <div><b>{i.suites}</b><span>suíte{i.suites > 1 ? 's' : ''}</span></div>}
              {i.banheiros > 0 && <div><b>{i.banheiros}</b><span>banheiro{i.banheiros > 1 ? 's' : ''}</span></div>}
              {i.vagas > 0 && <div><b>{i.vagas}</b><span>vaga{i.vagas > 1 ? 's' : ''}</span></div>}
              {i.condominio && <div><b>{brl(i.condominio)}</b><span>condomínio</span></div>}
              {i.iptu && <div><b>{brl(i.iptu)}</b><span>IPTU</span></div>}
            </div>
            {i.resumo && <p className="imovel-resumo">{i.resumo}</p>}
            <div className="bom-pesa">
              <div><h2>O que tem de bom</h2><ul>{bom.map((d) => <li key={d}>{d}</li>)}</ul></div>
              <div className="pesa"><h2>O que merece atenção</h2>{pesa.length ? <ul>{pesa.map((d) => <li key={d}>{d}</li>)}</ul> : <p className="muted">Ainda estou levantando os pontos de atenção deste imóvel com o proprietário. Se quiser saber algo antes, me pergunte e eu confirmo.</p>}</div>
            </div>
            {i.precoVisivel && i.preco ? <Analise i={i} /> : null}
            {i.video
              ? <div className="bloco-imovel" id="video"><span className="eyebrow">Vídeo</span><h2>Eu mostro o imóvel como ele é</h2><div className="video-16x9"><iframe src={i.video} title={`Vídeo de ${i.titulo}`} allowFullScreen loading="lazy" /></div></div>
              : null}
            <div className="bloco-imovel">
              <span className="eyebrow">Sobre o imóvel</span>
              {i.descricao.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
            </div>
            <div className="bloco-imovel">
              <span className="eyebrow">O bairro</span>
              <h2>{i.bairro}, {i.cidade}</h2>
              <p className="muted">A localização exata eu passo na conversa, e a visita é sempre comigo. <Link href={`/imoveis/${i.cidadeSlug}/${i.bairroSlug}/`}>Outros imóveis no {i.bairro} →</Link></p>
              <iframe className="mapa" title={`Mapa do bairro ${i.bairro}`} loading="lazy" src={`https://maps.google.com/maps?q=${encodeURIComponent(i.bairro + ', ' + i.cidade + ', SC')}&z=14&output=embed`} />
            </div>
          </article>
          <aside className="lateral">
            <div className="caixa-preco">
              <span className="nota">Valor</span>
              <div className="preco-grande num">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</div>
              {i.precoM2 && <p className="nota num">{brl(i.precoM2)} por m²{dif ? ` · ${Math.abs(dif)}% ${dif > 0 ? 'acima' : 'abaixo'} do bairro` : ''} · <a href="#analise">ver análise</a></p>}
              {i.reservado && <p className="nota" style={{ fontWeight: 700 }}>Reservado: pode voltar à venda, pergunte.</p>}
              <BotaoWhats texto={msg} dados={{ imovel: i.codigo }} className="btn btn-whats btn-full btn-grande">Conversar sobre este imóvel</BotaoWhats>
              <div className="visita-comigo"><img src="/marca/simbolo-preto.svg" alt="" width="36" height="36" /><p><b>Visita comigo.</b> Eu vou junto, mostro o que olhar e respondo na hora. {SITE.nome}, {SITE.creci}.</p></div>
              <span className="nota">Código {i.codigo}</span>
            </div>
          </aside>
        </div>
      </div>
      <section className="sec2 fundo-papel" style={{ marginTop: 72 }}>
        <div className="wrap">
          <h2>Se este imóvel fizer sentido, estes também podem fazer</h2>
          <div className="grade3" style={{ marginTop: 32 }}>{semelhantes(i).map((s) => <Card key={s.codigo} i={s} />)}</div>
        </div>
      </section>
      <div className="barra-mobile"><div style={{ flex: 1, lineHeight: 1.3 }}><b className="num">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</b><div className="nota">{i.codigo}</div></div><BotaoWhats texto={msg} dados={{ imovel: i.codigo, local: 'barra_mobile' }} className="btn btn-whats">Conversar sobre ele</BotaoWhats></div>
    </div>
  );
}
