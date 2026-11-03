'use client';
// Relatório do proprietário: a mesma peça aparece no admin (prévia), no link enviado ao proprietário e no PDF (imprimir).
import './relatorio.css';
import { SITE } from '@/lib/site';

const n = (v) => (v == null || Number.isNaN(Number(v)) ? '0' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const brl = (v) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const dataBr = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '');
const TIPO_PECA = { carrossel: 'Carrossel', post: 'Post', story: 'Story', reel: 'Reels' };

export default function RelatorioVista({ dados: d, texto, inicio, fim }) {
  if (!d?.imovel) return null;
  const i = d.imovel, s = d.site || {}, ig = d.instagram || {}, ads = d.anuncios || {}, it = d.interessados || {}, v = d.visitas || {}, m = d.mercado || {};
  const foto = i.foto ? (/^https?:/.test(i.foto) ? i.foto : `${SITE.dominio}${i.foto}`) : null;
  const kpis = [
    ['Visualizações no site', s.vis], ['Cliques para falar comigo', s.wa], ['Alcance no Instagram e anúncios', (ig.alcance || 0) + (ads.alcance || 0)],
    ['Novos interessados', it.novos], ['Visitas realizadas', v.periodo], ['Dias à venda', i.dias_no_mercado],
  ];
  const blocos = String(texto || '').split(/\n\s*\n|\n(?=O que fiz|O que o mercado|Minha leitura|Próximos passos)/).map((b) => b.trim()).filter(Boolean);
  return (
    <article className="rel">
      <header className="rel-topo">
        <img src="/marca/anderson-costa-horizontal-preto.svg" alt="Anderson Costa Negócios Imobiliários" className="rel-logo" />
        <div className="rel-periodo">Relatório do imóvel<br /><b>{dataBr(inicio || d.periodo?.inicio)} a {dataBr(fim || d.periodo?.fim)}</b></div>
      </header>
      <section className="rel-capa">
        {foto && <img src={foto} alt="" />}
        <div>
          <span className="rel-eyebrow">{i.codigo} · {i.bairro}, {i.cidade}</span>
          <h1>{i.titulo}</h1>
          <p>{i.proprietario ? `Olá, ${i.proprietario}. Aqui está o resumo de tudo o que aconteceu com o seu imóvel no período.`
            : i.parceiro ? `Olá, ${i.parceiro}. Aqui está o resumo do trabalho de divulgação deste imóvel no período, para você acompanhar e repassar ao proprietário.`
            : 'Aqui está o resumo de tudo o que aconteceu com o imóvel no período.'}</p>
          <p className="rel-preco">{brl(i.preco)}{i.preco_m2 ? <small> · {brl(i.preco_m2)}/m²</small> : null}</p>
        </div>
      </section>
      <section className="rel-kpis">{kpis.map(([r, val]) => <div key={r}><b>{n(val)}</b><span>{r}</span></div>)}</section>

      <section className="rel-sec">
        <h2>Divulgação</h2>
        <div className="rel-duas">
          <div>
            <h3>Instagram</h3>
            <ul className="rel-lista">
              <li><span>Publicações</span><b>{n(ig.pecas)}</b></li>
              <li><span>Alcance</span><b>{n(ig.alcance)}</b></li>
              <li><span>Visualizações</span><b>{n(ig.views)}</b></li>
              <li><span>Salvamentos e envios</span><b>{n((ig.salvos || 0) + (ig.compart || 0))}</b></li>
            </ul>
            {(ig.lista || []).length > 0 && (
              <ul className="rel-pecas">{ig.lista.slice(0, 4).map((p, k) => <li key={k}>{TIPO_PECA[p.tipo] || p.tipo}{p.alcance ? ` · ${n(p.alcance)} pessoas` : ''}{p.link && <> · <a href={p.link} target="_blank" rel="noopener">ver</a></>}</li>)}</ul>
            )}
          </div>
          <div>
            <h3>Anúncios e site</h3>
            <ul className="rel-lista">
              <li><span>Exibições dos anúncios</span><b>{n(ads.impressoes)}</b></li>
              <li><span>Conversas iniciadas pelos anúncios</span><b>{n(ads.conversas)}</b></li>
              {ads.investimento != null && <li><span>Investimento em anúncios</span><b>{brl(ads.investimento)}</b></li>}
              <li><span>Visualizações no site desde o início</span><b>{n(s.vis_total)}</b></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rel-sec">
        <h2>Interesse e visitas</h2>
        <ul className="rel-lista rel-lista-larga">
          <li><span>Interessados no período</span><b>{n(it.novos)}</b></li>
          <li><span>Interessados desde o início</span><b>{n(it.total)}</b></li>
          <li><span>Visitas no período</span><b>{n(v.periodo)}</b></li>
          <li><span>Visitas desde o início</span><b>{n(v.total)}</b></li>
          {v.agendadas > 0 && <li><span>Visitas já agendadas</span><b>{n(v.agendadas)}</b></li>}
        </ul>
      </section>

      {(i.ref_m2 || m.m2_mediana) && (
        <section className="rel-sec">
          <h2>Preço e mercado</h2>
          <ul className="rel-lista rel-lista-larga">
            {i.preco_m2 && <li><span>Preço por m² do seu imóvel</span><b>{brl(i.preco_m2)}</b></li>}
            {i.ref_m2 && <li><span>Referência de mercado (minha análise comparativa)</span><b>{brl(i.ref_m2)}</b></li>}
            {m.m2_mediana && <li><span>Mediana de imóveis parecidos à venda no bairro ({n(m.concorrentes)})</span><b>{brl(m.m2_mediana)}</b></li>}
          </ul>
        </section>
      )}

      {blocos.length > 0 && (
        <section className="rel-sec rel-texto">
          {blocos.map((b, k) => {
            const [primeira, ...resto] = b.split('\n');
            const titulo = /^(O que fiz|O que o mercado|Minha leitura|Próximos passos)/.test(primeira.trim());
            return titulo ? <div key={k}><h3>{primeira.replace(/[:#*]/g, '').trim()}</h3>{resto.join('\n').split('\n').filter(Boolean).map((p, j) => <p key={j}>{p.replace(/^[-•]\s*/, '')}</p>)}</div>
              : <p key={k}>{b}</p>;
          })}
        </section>
      )}

      <footer className="rel-rodape">
        <div><b>Anderson Costa</b> · Corretor de imóveis · {SITE.creci}</div>
        <div>{SITE.telefoneVisivel} · {SITE.dominio.replace('https://', '')}</div>
        <small>Números de visualizações do site, Instagram e anúncios medidos pelas próprias plataformas. Dados de interessados preservados conforme a LGPD.</small>
      </footer>
    </article>
  );
}
