import Link from 'next/link';
import { brl } from '@/lib/format';
export default function Card({ i }) {
  return (
    <Link href={`/imovel/${i.slug}/`} className="card">
      <div className="foto" style={{ backgroundImage: `url(${i.fotos[0].replace('.webp', '-p.webp')})` }} role="img" aria-label={i.titulo}><span className="selo">{i.tipo}</span></div>
      <div className="corpo">
        <div className="loc">{i.bairro} · {i.cidade}</div>
        <h3>{i.titulo}</h3>
        <div className="specs"><span>{i.area} m²</span><span>{i.quartos} quartos</span><span>{i.suites} suíte{i.suites > 1 ? 's' : ''}</span><span>{i.vagas} vaga{i.vagas > 1 ? 's' : ''}</span></div>
        <div className="preco">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</div>
      </div>
    </Link>
  );
}
