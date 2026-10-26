import './globals.css';
import Topo from '@/components/Topo';
import Rodape from '@/components/Rodape';
import Cookies from '@/components/Cookies';
import { WhatsFixo } from '@/components/Whats';
import { SITE } from '@/lib/site';
export const metadata = {
  metadataBase: new URL(SITE.dominio),
  title: { default: 'Anderson Costa Negócios Imobiliários | Imóveis em Jaraguá do Sul', template: '%s | Anderson Costa Imóveis' },
  description: 'Curadoria de imóveis em Jaraguá do Sul e região: os imóveis que fazem sentido para a sua família, com análise de preço, custos e financiamento. ' + SITE.creci + '.',
  robots: SITE.indexar ? { index: true, follow: true } : { index: false, follow: false },
  icons: { icon: '/marca/simbolo-preto.svg' },
  openGraph: { siteName: SITE.marca, locale: 'pt_BR', type: 'website' },
};
const consentDefault = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});`;
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: consentDefault }} />
        {SITE.gtmId && <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${SITE.gtmId}');` }} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: SITE.marca, url: SITE.dominio, telephone: '+' + SITE.whatsapp, areaServed: ['Jaraguá do Sul', 'Guaramirim', 'Schroeder', 'Corupá', 'Massaranduba'], identifier: { '@type': 'PropertyValue', propertyID: 'CRECI', value: SITE.creci } }) }} />
      </head>
      <body>
        <Topo />
        <main>{children}</main>
        <Rodape />
        <WhatsFixo />
        <Cookies />
      </body>
    </html>
  );
}
