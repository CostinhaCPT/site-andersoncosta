import RelatorioPublico from '@/components/RelatorioPublico';

export const metadata = {
  title: 'Relatório do imóvel',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RelatorioPublico />;
}
