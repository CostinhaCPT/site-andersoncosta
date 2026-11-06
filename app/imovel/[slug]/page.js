import Link from 'next/link';
import Galeria from '@/components/Galeria';
import Analise from '@/components/Analise';
import FormLead from '@/components/FormLead';
import Card from '@/components/Card';
import { BotaoWhats } from '@/components/Whats';
import { imoveis, porSlug, semelhantes } from '@/lib/imoveis';
import { brl, num, miniatura } from '@/lib/format';
import { SITE } from '@/lib/site';
import ContarVisita from '@/components/ContarVisita';
export function generateStaticParams() { return imoveis.map((i) => ({ slug: i.slug })); }
export async function generateMetadata({ params }) {
  const i = porSlug((await params).slug);
  return { title: i.titulo, description: `${i.resumo} ${brl(i.preco)}. ${i.bairro}, ${i.cidade}.`, alternates: { canonical: `/imovel/${i.slug}/` }, openGraph: { images: [miniatura(i.fotos[0])] } };
}
export default async function Pagina({ params }) {
  const i = porSlug((await params).slug);
  const msg = `Olá, Anderson! Vi o imóvel "${i.titulo}" (ref. ${i.codigo}) no site e quero saber mais.`;
  const ld = { '@context': 'https://schema.org', '@type': 'RealEstateListing', name: i.titulo, description: i.resumo, url: `${SITE.dominio}/imovel/${i.slug}/`, image: i.fotos.slice(0, 6).map((f) => (/^https?:/.test(f) ? f : SITE.dominio + f)),
    offers: { '@type': 'Offer', ...(i.precoVisivel && i.preco ? { price: i.preco, priceCurrency: 'BRL' } : {}), availability: i.reservado ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock', seller: { '@type': 'RealEstateAgent', name: SITE.marca, telephone: '+' + SITE.whatsapp, url: SITE.dominio } },
    mainEntity: { '@type': i.tipoSlug === 'apartamento' ? 'Apartment' : 'SingleFamilyResidence', numberOfBedrooms: i.quartos, numberOfBathroomsTotal: i.banheiros, ...(i.area ? { floorSize: { '@type': 'QuantitativeValue', value: i.area, unitCode: 'MTK' } } : {}), address: { '@type': 'PostalAddress', addressLocality: i.cidade, addressRegion: 'SC', addressCountry: 'BR' } } };
  return (
    <div className="pagina-imovel" data-codigo={i.codigo}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <ContarVisita codigo={i.codigo} titulo={i.titulo} />
      <div className="wrap">
        <div className="migalha"><Link href="/imoveis/">Imóveis</Link> / <Link href={`/imoveis/${i.cidadeSlug}/${i.bairroSlug}/`}>{i.bairro}</Link> / {i.tipo}</div>
        <Galeria fotos={i.fotos} titulo={i.titulo} />
        <div className="imovel-grid">
          <article>
            <span className="eyebrow">{i.tipo} · {i.bairro}, {i.cidade}</span>
            <h1 style={{ fontSize: 'clamp(1.2rem,3vw,1.8rem)' }}>{i.titulo}</h1>
            <p style={{ fontSize: '1.08rem' }}>{i.resumo}</p>
            <div className="ficha">
              {i.area && <div><b>{num(i.area)} m²</b><span>Área {i.tipoSlug === 'apartamento' ? 'privativa' : 'construída'}</span></div>}
              {i.terreno && <div><b>{num(i.terreno)} m²</b><span>Terreno</span></div>}
              {i.quartos > 0 && <div><b>{i.quartos}</b><span>Quartos</span></div>}
              {i.suites > 0 && <div><b>{i.suites}</b><span>Suíte{i.suites > 1 ? 's' : ''}</span></div>}
              {i.banheiros > 0 && <div><b>{i.banheiros}</b><span>Banheiros</span></div>}
              {i.vagas > 0 && <div><b>{i.vagas}</b><span>Vaga{i.vagas > 1 ? 's' : ''}</span></div>}
              {i.condominio && <div><b>{brl(i.condominio)}</b><span>Condomínio</span></div>}
              {i.iptu && <div><b>{brl(i.iptu)}</b><span>IPTU</span></div>}
            </div>
            <h2>Sobre o imóvel</h2>
            {i.descricao.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
            <div className="duas-col" style={{ alignItems: 'start', gap: 32, marginTop: 24 }}>
              <div><h3>Pontos fortes</h3><ul className="lista-check">{i.destaques.map((d) => <li key={d}>{d}</li>)}</ul></div>
              <div><h3>Pontos de atenção</h3>{i.atencao.length ? <ul className="lista-check lista-atencao">{i.atencao.map((d) => <li key={d}>{d}</li>)}</ul> : <p className="muted">Ainda estou levantando os pontos de atenção deste imóvel com o proprietário. Se quiser saber algo antes, me pergunte e eu confirmo.</p>}</div>
            </div>
            {i.video ? <div style={{ marginTop: 28, aspectRatio: '16/9' }}><iframe src={i.video} title={`Vídeo de ${i.titulo}`} style={{ width: '100%', height: '100%', border: 0, borderRadius: 10 }} allowFullScreen loading="lazy" /></div>
              : <div className="box" style={{ marginTop: 28 }}><h3>Vídeo honesto</h3><p className="muted" style={{ margin: 0 }}>Eu gravo o vídeo honesto deste imóvel quando ele entra na sua curadoria: o que ele tem de melhor e o que merece atenção, antes de você visitar. Peça pelo WhatsApp.</p></div>}
            <Analise i={i} />
            <h2>Localização</h2>
            <p className="muted">{i.bairro}, {i.cidade}, SC. O endereço exato eu passo no agendamento da visita, por segurança do proprietário.</p>
            <iframe title={`Mapa do bairro ${i.bairro}`} loading="lazy" style={{ width: '100%', height: 300, border: 0, borderRadius: 10 }} src={`https://maps.google.com/maps?q=${encodeURIComponent(i.bairro + ', ' + i.cidade + ', SC')}&z=14&output=embed`} />
          </article>
          <aside className="lateral">
            <div className="box">
              <span className="eyebrow">Valor de venda</span>
              <div className="preco-grande">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</div>
              {i.reservado && <p className="nota" style={{ marginTop: 8, fontWeight: 700 }}>Reservado: pode voltar à venda, pergunte.</p>}
              {i.precoM2 && <p className="nota" style={{ marginTop: 8 }}>{brl(i.precoM2)}/m² · <a href="#analise">ver análise de compra</a></p>}
              <p className="nota" style={{ marginTop: 4 }}>Referência do imóvel: {i.codigo}</p>
              <BotaoWhats texto={msg} dados={{ imovel: i.codigo }} className="btn btn-whats btn-full">Falar sobre este imóvel</BotaoWhats>
            </div>
            <FormLead imovel={i} titulo="Quero visitar este imóvel" botao="Pedir visita pelo WhatsApp" />
          </aside>
        </div>
        <section className="sec" style={{ paddingBottom: 40 }}>
          <h2>Imóveis semelhantes</h2>
          <div className="grade" style={{ marginTop: 24 }}>{semelhantes(i).map((s) => <Card key={s.codigo} i={s} />)}</div>
        </section>
      </div>
      <div className="barra-mobile"><div style={{ flex: 1 }}><b>{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</b><div className="nota">{i.bairro}</div></div><BotaoWhats texto={msg} dados={{ imovel: i.codigo, local: 'barra_mobile' }}>WhatsApp</BotaoWhats></div>
    </div>
  );
}
