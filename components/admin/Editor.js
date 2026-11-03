'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CamposExtras } from './Contatos';
import { sb, urlPublica, caminhoDaUrl, BUCKET } from '@/lib/admin/cliente';
import { STATUS, TIPOS, CIDADES, REF_CIDADE, grupo, gerarSlug, videoEmbed } from '@/lib/admin/opcoes';
import { processarFoto } from '@/lib/admin/imagem';
import { miniatura, brl } from '@/lib/format';
import { SITE } from '@/lib/site';

const NUMEROS = ['preco', 'area', 'terreno', 'quartos', 'suites', 'banheiros', 'vagas', 'condominio', 'iptu', 'ref_m2'];
const PUBLICOS = ['disponivel', 'reservado'];
const linhas = (t) => String(t || '').split('\n').map((s) => s.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
const paraNumero = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/\./g, '').replace(',', '.')));

export default function Editor({ imovel, todos, aoFechar }) {
  const novo = !imovel.id;
  const publicadoAntes = PUBLICOS.includes(imovel.status) && !novo;
  const [f, setF] = useState(() => ({
    ...imovel,
    destaquesTxt: (imovel.destaques || []).join('\n'),
    atencaoTxt: (imovel.atencao || []).join('\n'),
    fotos: imovel.fotos || [],
  }));
  const [slugManual, setSlugManual] = useState(!novo);
  const [notas, setNotas] = useState('');
  const [faltam, setFaltam] = useState([]);
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [redigindo, setRedigindo] = useState(false);
  const [mudou, setMudou] = useState(false);
  const [fotosSalvas, setFotosSalvas] = useState(imovel.fotos || []);

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setMudou(true);
    setF((x) => {
      const n = { ...x, [k]: v };
      if (!slugManual && (k === 'titulo' || k === 'cidade')) n.slug = gerarSlug(n.titulo, n.cidade);
      return n;
    });
  };

  const bairros = useMemo(() => [...new Set(todos.map((i) => i.bairro).filter(Boolean))].sort(), [todos]);

  // Price-per-m2 reference: same neighborhood and group if known, otherwise the city median
  const refSugerida = useMemo(() => {
    const g = grupo(f.tipo);
    const par = todos.find((i) => i.id !== f.id && i.bairro === f.bairro && grupo(i.tipo) === g && i.ref_m2);
    return par ? { ref_m2: Number(par.ref_m2), ref_amostra: par.ref_amostra || null, fonte: `mesma referência dos ${g === 'apto' ? 'apartamentos' : 'imóveis'} do ${f.bairro}` }
      : { ref_m2: REF_CIDADE[g], ref_amostra: null, fonte: 'mediana da cidade' };
  }, [f.tipo, f.bairro, f.id, todos]);

  const ficha = () => ({
    tipo: (TIPOS.find((t) => t[0] === f.tipo) || [])[1], cidade: f.cidade, bairro: f.bairro,
    preco: f.preco ? brl(paraNumero(f.preco)) : null, area_m2: f.area, terreno_m2: f.terreno,
    quartos: f.quartos, suites: f.suites, banheiros: f.banheiros, vagas: f.vagas,
    condominio: f.condominio ? brl(paraNumero(f.condominio)) : null,
    aceita_financiamento: f.aceita_financiamento ? 'sim' : null, aceita_permuta: f.aceita_permuta ? 'sim' : null,
    destaques_ja_escritos: linhas(f.destaquesTxt), pontos_de_atencao_ja_escritos: linhas(f.atencaoTxt),
  });

  const redigir = async () => {
    setRedigindo(true); setMsg(''); setFaltam([]);
    try {
      const { data: { session } } = await sb().auth.getSession();
      const r = await fetch(`${SITE.supabaseUrl}/functions/v1/admin-ia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: SITE.supabaseKey },
        body: JSON.stringify({ ficha: ficha(), notas }),
      });
      const t = await r.json();
      if (!r.ok) throw new Error(t.erro || 'falha');
      setMudou(true);
      setF((x) => {
        const n = { ...x, titulo: t.titulo, resumo: t.resumo, descricao: t.descricao, destaquesTxt: t.destaques.join('\n'), atencaoTxt: t.atencao.join('\n'), perfil_ideal: t.perfil_ideal };
        if (!slugManual) n.slug = gerarSlug(n.titulo, n.cidade);
        return n;
      });
      setFaltam(t.faltam || []);
      setMsg('Textos prontos. Revise antes de salvar: a IA só usa o que você informou.');
    } catch (e) {
      setMsg('Não consegui gerar os textos agora (' + e.message + ').');
    }
    setRedigindo(false);
  };

  const validar = (dados) => {
    const falta = [];
    if (!dados.titulo) falta.push('título');
    if (!dados.slug) falta.push('endereço da página');
    if (!dados.bairro) falta.push('bairro');
    if (PUBLICOS.includes(dados.status)) {
      if (!dados.preco) falta.push('preço');
      if (!dados.area && dados.tipo !== 'terreno') falta.push('área');
      if (!dados.fotos.length) falta.push('pelo menos 1 foto');
      if (!dados.descricao) falta.push('descrição');
    }
    return falta;
  };

  const salvar = async () => {
    setMsg('');
    const dados = {
      codigo: f.codigo, slug: (f.slug || '').trim(), status: f.status, titulo: (f.titulo || '').trim(), resumo: f.resumo || null,
      descricao: f.descricao || null, destaques: linhas(f.destaquesTxt), atencao: linhas(f.atencaoTxt), tipo: f.tipo,
      cidade: f.cidade, bairro: (f.bairro || '').trim(), preco_visivel: f.preco_visivel !== false,
      aceita_permuta: !!f.aceita_permuta, aceita_financiamento: !!f.aceita_financiamento, perfil_ideal: f.perfil_ideal || null,
      fotos: f.fotos, video: videoEmbed(f.video), origem: f.origem || null, codigo_parceiro: f.codigo_parceiro || null,
      destaque: !!f.destaque, visita_exige_proprietario: !!f.visita_exige_proprietario, proprietario_id: f.proprietario_id || null, campos: f.campos || {}, atualizado_em: new Date().toISOString(),
    };
    for (const k of NUMEROS) dados[k] = paraNumero(f[k]);
    if (!dados.ref_m2) { dados.ref_m2 = refSugerida.ref_m2; dados.ref_amostra = refSugerida.ref_amostra; }
    else if (dados.ref_m2 === refSugerida.ref_m2) dados.ref_amostra = refSugerida.ref_amostra;
    const falta = validar(dados);
    if (falta.length) { setMsg('Para salvar com esse status, falta: ' + falta.join(', ') + '. Você pode salvar como Rascunho.'); return; }
    setSalvando(true);
    const q = !f.id ? sb().from('imoveis').insert(dados).select('id').single() : sb().from('imoveis').update(dados).eq('id', f.id).select('id').single();
    const { data, error } = await q;
    if (error) {
      setSalvando(false);
      setMsg(/slug/.test(error.message) ? 'Já existe outro imóvel com esse endereço de página. Mude o título ou o endereço.' : 'Erro ao salvar: ' + error.message);
      return;
    }
    // Photos removed from this listing are deleted from storage
    const removidas = fotosSalvas.filter((u) => !f.fotos.includes(u)).map(caminhoDaUrl).filter(Boolean);
    if (removidas.length) await sb().storage.from(BUCKET).remove(removidas.flatMap((c) => [c, miniatura(c)]));
    setSalvando(false);
    setMudou(false);
    if (novo) setF((x) => ({ ...x, id: data.id }));
    setMsg(PUBLICOS.includes(dados.status) ? 'Salvo. O site é atualizado em até 30 minutos.' : 'Salvo.');
    setFotosSalvas(f.fotos);
  };

  const voltar = () => {
    if (mudou && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    aoFechar(true);
  };

  return (
    <section className="adm-pagina adm-editor">
      <div className="adm-cabeca">
        <button className="adm-link" onClick={voltar}>‹ Imóveis</button>
        <span className="adm-sub">{f.codigo}</span>
      </div>
      <h1>{novo ? 'Novo imóvel' : f.titulo || 'Imóvel'}</h1>

      <Bloco titulo="Situação">
        <div className="adm-status-opcoes">
          {STATUS.map(([v, n, d]) => (
            <label key={v} className={f.status === v ? 'on' : ''}>
              <input type="radio" name="status" value={v} checked={f.status === v} onChange={set('status')} />
              <b>{n}</b><small>{d}</small>
            </label>
          ))}
        </div>
        <label className="adm-check"><input type="checkbox" checked={!!f.destaque} onChange={set('destaque')} /> Mostrar entre os destaques da home</label>
      </Bloco>

      <Bloco titulo="Fotos" ajuda="A primeira foto é a capa. Arraste na ordem com as setas. As fotos são reduzidas e recebem sua marca d'água antes de subir.">
        <Fotos codigo={f.codigo} fotos={f.fotos} mudar={(fotos) => { setMudou(true); setF((x) => ({ ...x, fotos })); }} />
      </Bloco>

      <Bloco titulo="Ficha">
        <div className="adm-grade">
          <Campo rotulo="Tipo"><select value={f.tipo} onChange={set('tipo')}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></Campo>
          <Campo rotulo="Cidade"><input list="adm-cidades" value={f.cidade || ''} onChange={set('cidade')} /></Campo>
          <Campo rotulo="Bairro"><input list="adm-bairros" value={f.bairro || ''} onChange={set('bairro')} placeholder="Ex.: Amizade" /></Campo>
          <Campo rotulo="Preço (R$)"><input inputMode="numeric" value={f.preco ?? ''} onChange={set('preco')} placeholder="850000" /></Campo>
          <Campo rotulo={f.tipo === 'apartamento' || f.tipo === 'cobertura' ? 'Área privativa (m²)' : 'Área construída (m²)'}><input inputMode="decimal" value={f.area ?? ''} onChange={set('area')} /></Campo>
          <Campo rotulo="Terreno (m²)"><input inputMode="decimal" value={f.terreno ?? ''} onChange={set('terreno')} /></Campo>
          <Campo rotulo="Quartos"><input inputMode="numeric" value={f.quartos ?? ''} onChange={set('quartos')} /></Campo>
          <Campo rotulo="Suítes"><input inputMode="numeric" value={f.suites ?? ''} onChange={set('suites')} /></Campo>
          <Campo rotulo="Banheiros"><input inputMode="numeric" value={f.banheiros ?? ''} onChange={set('banheiros')} /></Campo>
          <Campo rotulo="Vagas"><input inputMode="numeric" value={f.vagas ?? ''} onChange={set('vagas')} /></Campo>
          <Campo rotulo="Condomínio (R$/mês)"><input inputMode="decimal" value={f.condominio ?? ''} onChange={set('condominio')} /></Campo>
          <Campo rotulo="IPTU (R$/ano)"><input inputMode="decimal" value={f.iptu ?? ''} onChange={set('iptu')} /></Campo>
        </div>
        <datalist id="adm-cidades">{CIDADES.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="adm-bairros">{bairros.map((b) => <option key={b} value={b} />)}</datalist>
        <div className="adm-checks">
          <label className="adm-check"><input type="checkbox" checked={f.preco_visivel !== false} onChange={set('preco_visivel')} /> Mostrar o preço no site</label>
          <label className="adm-check"><input type="checkbox" checked={!!f.aceita_financiamento} onChange={set('aceita_financiamento')} /> Aceita financiamento</label>
          <label className="adm-check"><input type="checkbox" checked={!!f.aceita_permuta} onChange={set('aceita_permuta')} /> Aceita permuta</label>
          <label className="adm-check"><input type="checkbox" checked={!!f.visita_exige_proprietario} onChange={set('visita_exige_proprietario')} /> Visita precisa combinar com o proprietário (o chat não confirma sozinho)</label>
          <Proprietario valor={f.proprietario_id} aoMudar={(id) => setF({ ...f, proprietario_id: id })} />
          <CamposExtras objeto="imovel" valores={f.campos || {}} onChange={(campos) => setF({ ...f, campos })} />
        </div>
      </Bloco>

      <Bloco titulo="Textos" ajuda="Escreva nas notas o que você sabe do imóvel (o que o proprietário contou, reformas, sol, rua, pontos de atenção) e toque em Escrever com IA. Ela usa só esses fatos e a ficha acima.">
        <Campo rotulo="Notas para a IA (não aparecem no site)">
          <textarea rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex.: reformada em 2023, cozinha com ilha, sol da manhã nos quartos, rua sem saída, a garagem coberta é só para 1 carro" />
        </Campo>
        <button className="adm-btn" onClick={redigir} disabled={redigindo}>{redigindo ? 'Escrevendo…' : '✦ Escrever com IA'}</button>
        {faltam.length > 0 && <div className="adm-aviso"><b>Vale confirmar com o proprietário:</b><ul>{faltam.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        <Campo rotulo={`Título (${(f.titulo || '').length}/70)`}><input value={f.titulo || ''} onChange={set('titulo')} placeholder="Casa térrea com quintal de 300 m² no Amizade" /></Campo>
        <Campo rotulo="Resumo (uma frase)"><input value={f.resumo || ''} onChange={set('resumo')} /></Campo>
        <Campo rotulo="Descrição (parágrafos separados por linha em branco)"><textarea rows={8} value={f.descricao || ''} onChange={set('descricao')} /></Campo>
        <div className="adm-grade2">
          <Campo rotulo="Pontos fortes (um por linha)"><textarea rows={5} value={f.destaquesTxt} onChange={set('destaquesTxt')} /></Campo>
          <Campo rotulo="Pontos de atenção (um por linha)"><textarea rows={5} value={f.atencaoTxt} onChange={set('atencaoTxt')} /></Campo>
        </div>
        <Campo rotulo="Para quem faz sentido (uso interno e do chat)"><input value={f.perfil_ideal || ''} onChange={set('perfil_ideal')} /></Campo>
      </Bloco>

      <Bloco titulo="Página e detalhes">
        <Campo rotulo="Endereço da página">
          <div className="adm-slug">
            <span>/imovel/</span>
            <input value={f.slug || ''} onChange={(e) => { setSlugManual(true); set('slug')(e); }} />
          </div>
          {publicadoAntes && <small className="adm-sub">Mudar o endereço de um imóvel já publicado quebra links compartilhados. Só altere se for necessário.</small>}
          {!publicadoAntes && slugManual && <button className="adm-link" onClick={() => { setSlugManual(false); setF((x) => ({ ...x, slug: gerarSlug(x.titulo, x.cidade) })); }}>Gerar a partir do título</button>}
        </Campo>
        <Campo rotulo="Vídeo (link do YouTube)"><input value={f.video || ''} onChange={set('video')} placeholder="https://youtu.be/..." /></Campo>
        <div className="adm-grade">
          <Campo rotulo="Origem">
            <select value={f.origem || ''} onChange={set('origem')}><option value="propria">Captação própria</option><option value="sartori">Parceria Rafael Sartori</option><option value="parceiro">Outro parceiro</option></select>
          </Campo>
          <Campo rotulo="Código no parceiro"><input value={f.codigo_parceiro || ''} onChange={set('codigo_parceiro')} /></Campo>
          <Campo rotulo={`Referência R$/m² (vazio = ${brl(refSugerida.ref_m2)}, ${refSugerida.fonte})`}><input inputMode="numeric" value={f.ref_m2 ?? ''} onChange={set('ref_m2')} placeholder={String(refSugerida.ref_m2)} /></Campo>
        </div>
      </Bloco>

      <div className="adm-barra">
        {msg && <p className="adm-msg">{msg}</p>}
        <div className="adm-acoes">
          {!novo && PUBLICOS.includes(f.status) && !mudou && <a className="adm-link" href={`/imovel/${f.slug}/`} target="_blank" rel="noopener">Ver no site ↗</a>}
          <button className="adm-btn adm-primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </section>
  );
}

function Bloco({ titulo, ajuda, children }) {
  return (<div className="adm-bloco"><h2>{titulo}</h2>{ajuda && <p className="adm-sub">{ajuda}</p>}{children}</div>);
}
function Campo({ rotulo, children }) {
  return (<label className="adm-campo"><span>{rotulo}</span>{children}</label>);
}

function Fotos({ codigo, fotos, mudar }) {
  const entrada = useRef(null);
  const [modo, setModo] = useState('discreta');
  const [prog, setProg] = useState('');
  const [erro, setErro] = useState('');

  const enviar = async (arquivos) => {
    setErro('');
    const lista = [...arquivos];
    let atuais = [...fotos];
    for (let n = 0; n < lista.length; n++) {
      setProg(`Preparando foto ${n + 1} de ${lista.length}…`);
      try {
        const p = await processarFoto(lista[n], modo);
        const base = `${codigo}/${Date.now()}-${n + 1}`;
        const tipo = p.ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const a = await sb().storage.from(BUCKET).upload(`${base}.${p.ext}`, p.grande, { contentType: tipo, cacheControl: '31536000' });
        if (a.error) throw a.error;
        const b = await sb().storage.from(BUCKET).upload(`${base}-p.${p.ext}`, p.pequena, { contentType: tipo, cacheControl: '31536000' });
        if (b.error) throw b.error;
        atuais = [...atuais, urlPublica(`${base}.${p.ext}`)];
        mudar(atuais);
      } catch (e) {
        setErro(`Foto ${lista[n].name}: ${e.message || e}`);
      }
    }
    setProg('');
    if (entrada.current) entrada.current.value = '';
  };
  const mover = (i, d) => {
    const n = [...fotos]; const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]]; mudar(n);
  };
  const capa = (i) => { const n = [...fotos]; const [x] = n.splice(i, 1); mudar([x, ...n]); };
  const tirar = (i) => { if (confirm('Remover esta foto?')) mudar(fotos.filter((_, k) => k !== i)); };

  return (
    <div>
      <div className="adm-fotos">
        {fotos.map((u, i) => (
          <figure key={u}>
            <img src={miniatura(u)} alt={`Foto ${i + 1}`} loading="lazy" />
            {i === 0 && <span className="adm-capa">Capa</span>}
            <figcaption>
              <button onClick={() => mover(i, -1)} aria-label="Mover para trás">‹</button>
              {i > 0 && <button onClick={() => capa(i)} aria-label="Usar como capa">★</button>}
              <button onClick={() => mover(i, 1)} aria-label="Mover para frente">›</button>
              <button onClick={() => tirar(i)} aria-label="Remover">✕</button>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="adm-upload">
        <label className="adm-campo"><span>Marca d'água das novas fotos</span>
          <select value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="discreta">Discreta no centro (captação própria)</option>
            <option value="faixa">Faixa escura no centro (cobre marca do parceiro)</option>
            <option value="nenhuma">Sem marca d'água</option>
          </select>
        </label>
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && enviar(e.target.files)} />
        <button className="adm-btn" onClick={() => entrada.current?.click()} disabled={!!prog}>{prog || '+ Adicionar fotos'}</button>
        {erro && <p className="adm-erro">{erro}</p>}
      </div>
    </div>
  );
}

/** Owner picker: search existing contacts or create one on the spot. Private: never shown on the site. */
function Proprietario({ valor, aoMudar }) {
  const [atual, setAtual] = useState(null);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState([]);
  useEffect(() => {
    if (!valor) { setAtual(null); return; }
    sb().from('contatos').select('id,nome,whatsapp').eq('id', valor).maybeSingle().then(({ data }) => setAtual(data));
  }, [valor]);
  useEffect(() => {
    if (busca.length < 2) { setAchados([]); return; }
    const t = setTimeout(() => sb().from('contatos').select('id,nome,whatsapp').or(`nome.ilike.%${busca.replace(/[%,()]/g, '')}%,whatsapp.ilike.%${busca.replace(/\D/g, '') || 'x'}%`).limit(8)
      .then(({ data }) => setAchados(data || [])), 250);
    return () => clearTimeout(t);
  }, [busca]);
  const criar = async () => {
    const nome = busca.trim(); if (!nome) return;
    const d = nome.replace(/\D/g, '');
    const { data, error } = await sb().from('contatos').insert(d.length >= 10 ? { whatsapp: d.length <= 11 ? '55' + d : d, papeis: ['proprietario'] } : { nome, papeis: ['proprietario'] }).select('id,nome,whatsapp').single();
    if (!error) { aoMudar(data.id); setBusca(''); }
  };
  return (
    <div className="adm-campo">
      <span>Proprietário (só você vê)</span>
      {atual ? <p className="adm-msg">{atual.nome || atual.whatsapp} <button type="button" className="adm-link" onClick={() => aoMudar(null)}>trocar</button></p> : <>
        <input placeholder="Buscar contato pelo nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca.length >= 2 && <div className="adm-sugestoes">
          {achados.map((c) => <button key={c.id} type="button" onClick={() => { aoMudar(c.id); setBusca(''); }}>{c.nome || c.whatsapp}</button>)}
          <button type="button" onClick={criar}>+ Criar "{busca}"</button>
        </div>}
      </>}
    </div>
  );
}
