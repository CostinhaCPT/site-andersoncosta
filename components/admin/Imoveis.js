'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { STATUS, TIPOS, proximoCodigo } from '@/lib/admin/opcoes';
import { brl, miniatura } from '@/lib/format';
import Editor from './Editor';

const COLUNAS = 'id,codigo,slug,status,titulo,resumo,descricao,destaques,atencao,tipo,cidade,bairro,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,condominio,iptu,aceita_permuta,aceita_financiamento,perfil_ideal,fotos,video,origem,codigo_parceiro,ref_m2,ref_amostra,destaque,visita_exige_proprietario,atualizado_em,proprietario_id,campos';
const rotulo = (lista, v) => (lista.find((x) => x[0] === v) || [v, v])[1];

export default function Imoveis() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState('ativos');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    const { data, error } = await sb().from('imoveis').select(COLUNAS).order('codigo', { ascending: false });
    if (error) setErro(error.message); else setLista(data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const vistos = useMemo(() => (lista || [])
    .filter((i) => filtro === 'todos' || (filtro === 'ativos' ? ['disponivel', 'reservado', 'rascunho'].includes(i.status) : i.status === filtro))
    .filter((i) => !busca || `${i.codigo} ${i.titulo} ${i.bairro}`.toLowerCase().includes(busca.toLowerCase())), [lista, filtro, busca]);

  if (editando) {
    return <Editor imovel={editando} todos={lista || []} aoFechar={(mudou) => { setEditando(null); if (mudou) carregar(); }} />;
  }
  const novo = () => setEditando({
    codigo: proximoCodigo(lista || []), status: 'rascunho', tipo: 'casa', cidade: 'Jaraguá do Sul', bairro: '', preco_visivel: true,
    destaques: [], atencao: [], fotos: [], origem: 'propria', destaque: false,
  });
  const contagem = (s) => (lista || []).filter((i) => i.status === s).length;

  return (
    <section className="adm-pagina">
      <div className="adm-cabeca">
        <div>
          <h1>Imóveis</h1>
          {lista && <p className="adm-sub">{contagem('disponivel')} no site · {contagem('reservado')} reservados · {contagem('rascunho')} rascunhos</p>}
        </div>
        <button className="adm-btn adm-primario" onClick={novo} disabled={!lista}>+ Novo imóvel</button>
      </div>
      <div className="adm-filtros">
        <input type="search" placeholder="Buscar por código, título ou bairro" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="ativos">No site e rascunhos</option>
          {STATUS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          <option value="todos">Todos</option>
        </select>
      </div>
      {erro && <p className="adm-erro">{erro}</p>}
      {!lista ? <p className="adm-sub">Carregando…</p> : (
        <ul className="adm-lista">
          {vistos.map((i) => (
            <li key={i.id}>
              <button onClick={() => setEditando(i)}>
                <span className="adm-mini" style={{ backgroundImage: i.fotos?.[0] ? `url(${miniatura(i.fotos[0])})` : 'none' }} />
                <span className="adm-info">
                  <b>{i.titulo || 'Sem título'}</b>
                  <small>{i.codigo} · {rotulo(TIPOS, i.tipo)} · {i.bairro || 'sem bairro'} · {i.preco ? brl(Number(i.preco)) : 'sem preço'}</small>
                </span>
                <span className={`adm-status s-${i.status}`}>{rotulo(STATUS, i.status)}</span>
              </button>
            </li>
          ))}
          {!vistos.length && <li className="adm-sub" style={{ padding: 16 }}>Nenhum imóvel aqui.</li>}
        </ul>
      )}
      <p className="adm-nota">O site público é atualizado automaticamente depois que você salva (pode levar até 30 minutos). Rascunhos nunca aparecem no site.</p>
    </section>
  );
}
