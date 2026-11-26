'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';

// Histórico de avisos: nada some ao clicar, só fica marcado como lido.
export const TIPOS_AVISO = {
  lead: { nome: 'Lead', cor: '#12805c' },
  atencao: { nome: 'Atenção', cor: '#c2410c' },
  publicacao: { nome: 'Publicação', cor: '#1d4ed8' },
  domus: { nome: 'Domus', cor: '#6b7280' },
  sistema: { nome: 'Sistema', cor: '#6b7280' },
};
const semEtiqueta = (t) => String(t || '').replace(/^\S+\s+[A-ZÇÃÉÍÓÚ]+\s+·\s+/, '');
const quando = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Avisos({ aoIr, aoMudar }) {
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const carregar = () => sb().from('notificacoes').select('id, titulo, corpo, url, tipo, criado_em, lida_em')
    .gte('criado_em', new Date(Date.now() - 30 * 864e5).toISOString()).order('criado_em', { ascending: false }).limit(300)
    .then(({ data }) => { setLista(data || []); aoMudar?.(); });
  useEffect(() => { carregar(); }, []);

  const abrir = async (n) => {
    if (!n.lida_em) await sb().from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('id', n.id);
    const aba = new URLSearchParams(String(n.url || '').split('?')[1] || '').get('aba');
    if (aba) aoIr(aba); else carregar();
  };
  const lerTodos = async () => {
    await sb().from('notificacoes').update({ lida_em: new Date().toISOString() }).is('lida_em', null);
    carregar();
  };
  const vis = lista.filter((n) => filtro === 'todos' || (filtro === 'nao_lidos' ? !n.lida_em : (n.tipo || 'sistema') === filtro));
  const naoLidos = lista.filter((n) => !n.lida_em).length;

  return (
    <div className="adm-avisos">
      <div className="adm-cabeca"><h2>Avisos</h2>{naoLidos > 0 && <button className="adm-btn" onClick={lerTodos}>Marcar todos como lidos</button>}</div>
      <div className="adm-subabas">
        {[['todos', 'Todos'], ['nao_lidos', `Não lidos${naoLidos ? ` (${naoLidos})` : ''}`], ...Object.entries(TIPOS_AVISO).filter(([k]) => k !== 'sistema').map(([k, v]) => [k, v.nome])].map(([k, n]) => (
          <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{n}</button>
        ))}
      </div>
      {!vis.length && <p className="adm-sub">Nada por aqui nos últimos 30 dias.</p>}
      <ul className="adm-avisos-lista">
        {vis.map((n) => {
          const t = TIPOS_AVISO[n.tipo] || TIPOS_AVISO.sistema;
          return (
            <li key={n.id} className={n.lida_em ? 'lido' : ''} style={{ borderLeftColor: t.cor }} onClick={() => abrir(n)}>
              <span className="adm-aviso-tag" style={{ background: t.cor }}>{t.nome}</span>
              <strong>{semEtiqueta(n.titulo)}</strong>
              {n.corpo && <p>{n.corpo}</p>}
              <small>{quando(n.criado_em)}{!n.lida_em && ' · novo'}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
