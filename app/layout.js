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
  title: { default: 'Anderson Costa Negócios Imobiliários | Imóveis em Jaraguá do Sul', template: '%s | Anderson Costa Imóveis' },
  description: 'Curadoria de imóveis em Jaraguá do Sul e região: os imóveis que fazem sentido para a sua família, com análise de preço, custos e financiamento. ' + SITE.creci + '.',
  robots: SITE.indexar ? { index: true, follow: true } : { index: false, follow: false },
  icons: { icon: '/marca/simbolo-preto.svg' },
  openGraph: { siteName: SITE.marca, locale: 'pt_BR', type: 'website' },
};
const consentDefault = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});try{if(localStorage.getItem('ac_consent')==='sim')gtag('consent','update',{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}catch(e){}`;
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: consentDefault }} />
        {SITE.gtmId && <script dangerouslySetInnerHTML={{ __html: `if(location.pathname.indexOf('/admin')!==0)(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${SITE.gtmId}');` }} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateAgent', '@id': SITE.dominio + '/#anderson', name: SITE.marca, alternateName: 'Anderson Costa, Corretor de Imóveis', url: SITE.dominio, logo: SITE.dominio + '/marca/anderson-costa-horizontal-preto.svg', image: SITE.dominio + '/img/anderson-praia-bracos.webp', telephone: '+' + SITE.whatsapp, email: SITE.email, priceRange: '$$$', address: { '@type': 'PostalAddress', addressLocality: 'Jaraguá do Sul', addressRegion: 'SC', addressCountry: 'BR' }, areaServed: ['Jaraguá do Sul', 'Guaramirim', 'Schroeder', 'Corupá', 'Massaranduba'].map((c) => ({ '@type': 'City', name: c })), knowsAbout: ['Mercado imobiliário de Jaraguá do Sul', 'Financiamento habitacional', 'Custos de compra de imóvel (ITBI, escritura e registro)', 'Curadoria imobiliária', 'Avaliação de imóveis'], sameAs: SITE.redes, identifier: { '@type': 'PropertyValue', propertyID: 'CRECI', value: SITE.creci }, founder: { '@type': 'Person', name: 'Anderson Costa', jobTitle: 'Corretor de Imóveis', identifier: SITE.creci } }) }} />
      </head>
      <body>
        {SITE.gtmId && <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${SITE.gtmId}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} /></noscript>}
        <Moldura topo={<Topo />} rodape={<Rodape />} extras={<>{SITE.webchat ? <Chat /> : <WhatsFixo />}<Cookies /></>}>{children}</Moldura>
      </body>
    </html>
  );
}
