import './globals.css';
import Topo from '@/components/Topo';
import Rodape from '@/components/Rodape';
import Cookies from '@/components/Cookies';
import Chat from '@/components/Chat';
import { WhatsFixo } from '@/components/Whats';
import Moldura from '@/components/Moldura';
import { SITE } from '@/lib/site';
export const metadata = {
  metadataBase: new URL(SITE.dominio),
  title: { default: 'Anderson Costa Negócios Imobiliários | Imóveis em Jaraguá do Sul', template: '%s | Anderson Costa' },
  description: 'Curadoria de imóveis em Jaraguá do Sul e região: os imóveis que fazem sentido para a sua família, com o preço comparado ao bairro, o que merece atenção e a visita sempre comigo. ' + SITE.creci + '.',
  robots: SITE.indexar ? { index: true, follow: true } : { index: false, follow: false },
  icons: { icon: '/marca/simbolo-preto.svg' },
  openGraph: { siteName: SITE.marca, locale: 'pt_BR', type: 'website', images: [{ url: '/og/site.jpg', width: 1200, height: 630, alt: 'Casa com piscina e vista verde em Jaraguá do Sul, selecionada por Anderson Costa' }] },
  twitter: { card: 'summary_large_image' },
};
const consentDefault = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});try{if(localStorage.getItem('ac_consent')==='sim')gtag('consent','update',{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}catch(e){}`;
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: consentDefault }} />
        {SITE.gtmId && <script dangerouslySetInnerHTML={{ __html: `if(location.pathname.indexOf('/admin')!==0)(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${SITE.gtmId}');` }} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateAgent', '@id': SITE.dominio + '/#anderson', name: SITE.marca, alternateName: 'Anderson Costa, Corretor de Imóveis', url: SITE.dominio, logo: SITE.dominio + '/marca/anderson-costa-horizontal-preto.svg', image: SITE.dominio + '/img/anderson-sofa-2.webp', telephone: '+' + SITE.whatsapp, email: SITE.email, priceRange: '$$$', address: { '@type': 'PostalAddress', addressLocality: 'Jaraguá do Sul', addressRegion: 'SC', addressCountry: 'BR' }, areaServed: ['Jaraguá do Sul', 'Guaramirim', 'Schroeder', 'Corupá', 'Massaranduba', 'Itapema', 'Porto Belo'].map((c) => ({ '@type': 'City', name: c })), knowsAbout: ['Mercado imobiliário de Jaraguá do Sul', 'Financiamento habitacional', 'Análise de preço por m² por bairro', 'Curadoria imobiliária', 'Avaliação de imóveis', 'Investimento em imóveis no litoral de Santa Catarina', 'Imóveis na planta e incorporação imobiliária'], sameAs: SITE.redes, identifier: { '@type': 'PropertyValue', propertyID: 'CRECI', value: SITE.creci }, founder: { '@id': SITE.dominio + '/#pessoa' } }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
          { '@type': 'Person', '@id': SITE.dominio + '/#pessoa', name: 'Anderson Costa', jobTitle: 'Corretor de Imóveis', image: SITE.dominio + '/img/anderson-sofa-2.webp', url: SITE.dominio + '/sobre/', worksFor: { '@id': SITE.dominio + '/#anderson' }, sameAs: SITE.redes, hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Registro profissional', name: SITE.creci, recognizedBy: { '@type': 'Organization', name: 'CRECI SC' } }, knowsAbout: ['Imóveis em Jaraguá do Sul', 'Preço do m² por bairro', 'Financiamento imobiliário'], address: { '@type': 'PostalAddress', addressLocality: 'Jaraguá do Sul', addressRegion: 'SC', addressCountry: 'BR' } },
          { '@type': 'WebSite', '@id': SITE.dominio + '/#site', url: SITE.dominio, name: SITE.marca, inLanguage: 'pt-BR', publisher: { '@id': SITE.dominio + '/#anderson' } },
        ] }) }} />
      </head>
      <body>
        {SITE.gtmId && <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${SITE.gtmId}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} /></noscript>}
        <Moldura topo={<Topo />} rodape={<Rodape />} extras={<>{SITE.webchat ? <Chat /> : <WhatsFixo />}<Cookies /></>}>{children}</Moldura>
      </body>
    </html>
  );
}
