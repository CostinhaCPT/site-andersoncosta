import Link from 'next/link';
import { SITE } from '@/lib/site';
import { bairros } from '@/lib/imoveis';
export default function Rodape() {
  return (
    <footer className="rodape">
      <div className="wrap">
        <div className="cols">
          <div>
            <img src="/marca/anderson-costa-horizontal-branco.svg" alt="Anderson Costa" style={{ height: 22, marginBottom: 18 }} />
            <p style={{ maxWidth: 360 }}>{SITE.frase}</p>
            <p><b style={{ color: '#fff' }}>{SITE.creci}</b><br />Jaraguá do Sul, Santa Catarina</p>
          </div>
          <div>
            <span className="eyebrow">Bairros</span>
            {bairros().slice(0, 7).map((b) => <Link key={b.bairroSlug} href={`/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`}>{b.bairro}</Link>)}
          </div>
          <div>
            <span className="eyebrow">Atendimento</span>
            <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener">WhatsApp {SITE.telefoneVisivel}</a>
            <Link href="/curadoria/">Curadoria gratuita</Link>
            <Link href="/anuncie-seu-imovel/">Quero vender meu imóvel</Link>
            <Link href="/politica-de-privacidade/">Política de privacidade</Link>
          </div>
        </div>
        <div className="base"><span>© {new Date().getFullYear()} {SITE.marca}. {SITE.creci}.</span><span>Imagens e valores sujeitos a alteração sem aviso prévio.</span></div>
      </div>
    </footer>
  );
}
