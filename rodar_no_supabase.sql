-- 014: relatório condicional. Quando o corretor parceiro não passa o contato do dono,
--      o relatório vai para o parceiro repassar. Cada imóvel pode ligar ou desligar o relatório mensal.
alter table public.imoveis add column if not exists parceiro_id uuid references public.contatos(id) on delete set null;
alter table public.imoveis add column if not exists relatorio_mensal boolean not null default true;

create or replace function public.montar_relatorio(p_codigo text, p_inicio date, p_fim date)
returns jsonb language sql stable security definer set search_path = public as $$
  with im as (select * from public.imoveis where codigo = upper(p_codigo)),
  ini as (select (p_inicio::timestamp at time zone 'America/Sao_Paulo') t0, ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo') t1),
  site as (
    select coalesce(sum(visualizacoes) filter (where dia between p_inicio and p_fim), 0) vis,
           coalesce(sum(whats) filter (where dia between p_inicio and p_fim), 0) wa,
           coalesce(sum(visualizacoes), 0) vis_total, coalesce(sum(whats), 0) wa_total
    from public.site_imovel_dia where imovel_codigo = upper(p_codigo)
  ),
  ig as (
    select count(*) pecas,
      coalesce(sum((metricas->>'reach')::numeric), 0) alcance,
      coalesce(sum((metricas->>'views')::numeric), 0) views,
      coalesce(sum((metricas->>'likes')::numeric), 0) curtidas,
      coalesce(sum((metricas->>'saved')::numeric), 0) salvos,
      coalesce(sum((metricas->>'shares')::numeric), 0) compart,
      coalesce(sum((metricas->>'comments')::numeric), 0) comentarios,
      coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'titulo', titulo, 'link', ig_permalink, 'alcance', (metricas->>'reach')::numeric, 'quando', publicado_em) order by (metricas->>'reach')::numeric desc nulls last) filter (where true), '[]') lista
    from public.criativos, ini
    where imovel_codigo = upper(p_codigo) and status = 'publicado' and publicado_em >= ini.t0 and publicado_em < ini.t1
  ),
  ads as (
    select count(*) n,
      coalesce(sum((metricas->>'impressoes')::numeric), 0) impressoes, coalesce(sum((metricas->>'alcance')::numeric), 0) alcance,
      coalesce(sum((metricas->>'cliques')::numeric), 0) cliques, coalesce(sum((metricas->>'conversas')::numeric), 0) conversas,
      coalesce(sum((metricas->>'gasto')::numeric), 0) investimento
    from public.anuncios where imovel_codigo = upper(p_codigo) and status in ('ativo','pausado','encerrado','criado_pausado')
  ),
  inter as (
    select count(*) filter (where l.criado_em >= ini.t0 and l.criado_em < ini.t1) novos, count(*) total
    from public.leads l, ini
    where (l.imovel_codigo = upper(p_codigo) or upper(p_codigo) = any (l.imoveis_interesse)) and coalesce(l.funil, 'compra') = 'compra'
  ),
  vis as (
    select count(*) filter (where v.inicio >= ini.t0 and v.inicio < ini.t1 and v.status in ('confirmada','realizada')) periodo,
           count(*) filter (where v.status in ('confirmada','realizada')) total,
           count(*) filter (where v.inicio > now() and v.status in ('solicitada','confirmada')) agendadas
    from public.visitas v, ini where v.imovel_codigo = upper(p_codigo)
  ),
  fb as (
    select coalesce(jsonb_agg(x.t order by x.q desc), '[]') lista from (
      select v.observacoes t, v.inicio q from public.visitas v, ini
        where v.imovel_codigo = upper(p_codigo) and coalesce(v.observacoes, '') <> '' and v.inicio >= ini.t0 and v.inicio < ini.t1
      union all
      select a.corpo, a.quando from public.atividades a, ini
        where a.corpo ilike '%' || upper(p_codigo) || '%' and a.quando >= ini.t0 and a.quando < ini.t1
      limit 30) x
  ),
  mercado as (
    select count(*) concorrentes, percentile_cont(0.5) within group (order by o.preco / nullif(o.area, 0)) m2_mediana
    from public.imoveis o, im
    where o.codigo <> im.codigo and o.bairro = im.bairro and o.tipo = im.tipo and o.status in ('disponivel','reservado') and o.area > 0 and o.preco > 0
  )
  select jsonb_build_object(
    'imovel', (select jsonb_build_object('codigo', codigo, 'titulo', titulo, 'bairro', bairro, 'cidade', cidade, 'tipo', tipo, 'preco', preco, 'area', area,
                 'preco_m2', round(preco / nullif(area, 0)), 'ref_m2', ref_m2, 'foto', fotos->>0, 'slug', slug,
                 'dias_no_mercado', (current_date - criado_em::date),
                 'proprietario', (select split_part(c.nome, ' ', 1) from public.contatos c where c.id = im.proprietario_id),
                 'parceiro', (select split_part(c.nome, ' ', 1) from public.contatos c where c.id = im.parceiro_id)) from im),
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'site', (select to_jsonb(site) from site),
    'instagram', (select to_jsonb(ig) from ig),
    'anuncios', (select to_jsonb(ads) from ads),
    'interessados', (select to_jsonb(inter) from inter),
    'visitas', (select to_jsonb(vis) from vis),
    'mercado', (select jsonb_build_object('concorrentes', concorrentes, 'm2_mediana', round(m2_mediana::numeric)) from mercado),
    'interno', jsonb_build_object('feedbacks', (select lista from fb))
  )
$$;
revoke all on function public.montar_relatorio(text, date, date) from public, anon;
grant execute on function public.montar_relatorio(text, date, date) to authenticated;

create or replace function public.gerar_relatorios_mensais()
returns int language plpgsql security definer set search_path = public as $$
declare i record; n int := 0; f date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 day')::date; s date := date_trunc('month', f)::date;
begin
  for i in select codigo from public.imoveis
           where status in ('disponivel','reservado') and relatorio_mensal and (proprietario_id is not null or parceiro_id is not null) loop
    if not exists (select 1 from public.relatorios where imovel_codigo = i.codigo and inicio = s and fim = f) then
      insert into public.relatorios (imovel_codigo, inicio, fim, dados) values (i.codigo, s, f, public.montar_relatorio(i.codigo, s, f));
      n := n + 1;
    end if;
  end loop;
  if n > 0 then
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Relatórios do mês prontos', n || ' relatório(s) para revisar e enviar', '/admin/?aba=relatorios', 'relatorios-' || f);
  end if;
  return n;
end $$;
revoke all on function public.gerar_relatorios_mensais() from public, anon, authenticated;
