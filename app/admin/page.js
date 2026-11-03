import Admin from '@/components/admin/Admin';
import './admin.css';
export const metadata = {
  title: 'AC CRM',
  robots: { index: false, follow: false },
  manifest: '/app/admin.webmanifest',
  appleWebApp: { capable: true, title: 'AC CRM', statusBarStyle: 'black' },
  icons: { icon: '/marca/simbolo-preto.svg', apple: '/app/apple-touch-icon.png' },
};
export const viewport = { themeColor: '#111111', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function Pagina() { return <Admin />; }
