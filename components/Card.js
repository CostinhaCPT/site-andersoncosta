import Link from 'next/link';
import { brl } from '@/lib/format';
import CardFotos from './CardFotos';
// Card de imóvel: foto vertical em moldura, bairro e preço na mesma linha, título, números.
// atencao: mostra o primeiro ponto de atenção da ficha (usado na vitrine da página inicial).
export default function Card({ i, prioridade = false, atencao = false }) {
  const selo = i.reservado ? 'Reservado' : (i.destaque || /^AC-/.test(i.codigo)) ? 'Selecionado por mim' : null;
  const specs = [i.area ? `${i.area} m²` : i.terreno ? `${i.terreno} m² de terreno` : null, i.quartos > 0 ? `${i.quartos} quarto${i.quartos > 1 ? 's' : ''}` : null, i.suites > 0 ? `${i.suites} suíte${i.suites > 1 ? 's' : ''}` : null, i.vagas > 0 ? `${i.vagas} vaga${i.vagas > 1 ? 's' : ''}` : null].filter(Boolean);
  return (
    <Link href={`/imovel/${i.slug}/`} className="card">
      <CardFotos fotos={i.fotos} titulo={i.titulo} selo={selo} prioridade={prioridade} />
      <div className="corpo">
        <div className="card-linha"><span className="loc">{i.bairro}{i.cidadeSlug && i.cidadeSlug !== 'jaragua-do-sul' ? ` · ${i.cidade}` : ''}</span><b className="preco num">{i.precoVisivel ? brl(i.preco) : 'Sob consulta'}</b></div>
        <h3>{i.titulo}</h3>
        <div className="specs num">{specs.join(' · ')}</div>
        {atencao && i.atencao?.[0] && <p className="card-atencao"><b>Atenção:</b> {i.atencao[0]}</p>}
      </div>
    </Link>
  );
}
