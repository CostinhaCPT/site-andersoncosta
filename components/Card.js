import Link from 'next/link';
import { brl } from '@/lib/format';
import CardFotos from './CardFotos';
export default function Card({ i }) {
  return (
    <Link href={`/imovel/${i.slug}/`} className="card">
      <CardFotos fotos={i.fotos} titulo={i.titulo} selo={i.reservado ? 'Reservado' : i.tipo} />
      <div className="corpo">
        <div className="loc">{i.bairro} · {i.cidade}</div>
        <h3>{i.titulo}</h3>
        <div className="specs">{i.area ? <span>{i.area} m²</span> : i.terreno ? <span>{i.terreno} m² de terreno</span> : null}{i.quartos > 0 && <span>{i.quartos} quartos</span>}{i.suites > 0 && <span>{i.suites} suíte{i.suites > 1 ? 's' : ''}</span>}{i.vagas > 0 && <span>{i.vagas} vaga{i.vagas > 1 ? 's' : ''}</span>}</div>
        <div className="preco">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</div>
      </div>
    </Link>
  );
}
