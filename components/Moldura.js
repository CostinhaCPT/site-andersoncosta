'use client';
import { usePathname } from 'next/navigation';
// Public chrome (header, footer, chat, cookie banner) stays out of the admin area and LPs
export default function Moldura({ topo, rodape, extras, children }) {
  const p = usePathname() || '';
  if (p.startsWith('/admin')) return <main>{children}</main>;
  // Landing pages have their own header and footer
  if (p.startsWith('/lp')) return (<><main>{children}</main>{extras}</>);
  return (<>{topo}<main>{children}</main>{rodape}{extras}</>);
}
