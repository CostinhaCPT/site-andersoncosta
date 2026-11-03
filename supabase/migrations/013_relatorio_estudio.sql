-- 013: Estúdio no padrão do Instagram (publicação com música), contagem de visitas no site por imóvel
--      e relatório do proprietário (gerado todo dia 1, revisado pelo Anderson antes de enviar).

-- 1. Estúdio: modo de publicação ------------------------------------------------------
-- automatico = a Meta publica sozinha (sem música da biblioteca do Instagram)
-- assistido  = no horário o app avisa o Anderson, ele posta pelo Instagram e escolhe a música
alter table public.criativos add column if not exists modo text not null default 'assistido';
alter table public.criativos add column if not exists dados jsonb not null default '{}'::jsonb;
alter table public.criativos drop constraint if exists criativos_modo_check;
alter table public.criativos add constraint criativos_modo_check check (modo in ('automatico','assistido'));
alter table public.criativos drop constraint if exists criativos_status_check;
alter table public.criativos add constraint criativos_status_check
  check (status in ('rascunho','agendado','aguardando','publicando','publicado','erro','arquivado'));

-- 2. Visitas e cliques no site, por imóvel e por dia (sem dado pessoal) ------------------
create table if not exists public.site_imovel_dia (
  imovel_codigo text not null,
  dia date not null,
  visualizacoes int not null default 0,
  whats int not null default 0,
  primary key (imovel_codigo, dia)
);
alter table public.site_imovel_dia enable row level security;
drop policy if exists "admin site_imovel_dia" on public.site_imovel_dia;
create policy "admin site_imovel_dia" on public.site_imovel_dia for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create or replace function public.contar_imovel(p_codigo text, p_tipo text default 'view')
returns void language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(p_codigo)); d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if c is null or not exists (select 1 from public.imoveis where codigo = c) then return; end if;
  insert into public.site_imovel_dia (imovel_codigo, dia, visualizacoes, whats)
    values (c, d, case when p_tipo = 'whats' then 0 else 1 end, case when p_tipo = 'whats' then 1 else 0 end)
  on conflict (imovel_codigo, dia) do update set
    visualizacoes = site_imovel_dia.visualizacoes + excluded.visualizacoes,
    whats = site_imovel_dia.whats + excluded.whats;
end $$;
revoke all on function public.contar_imovel(text, text) from public;
grant execute on function public.contar_imovel(text, text) to anon, authenticated;

-- 3. Relatório do proprietário ---------------------------------------------------------
create table if not exists public.relatorios (
  id uuid primary key default gen_random_uuid(),
  imovel_codigo text not null,
  inicio date not null,
  fim date not null,
  dados jsonb not null default '{}'::jsonb,
  texto text,                       -- análise e próximos passos, na voz do Anderson (ele revisa)
  opcoes jsonb not null default '{}'::jsonb,   -- {mostrar_investimento: bool}
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'rascunho' check (status in ('rascunho','liberado')),
  liberado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists relatorios_imovel on public.relatorios (imovel_codigo, fim desc);
alter table public.relatorios enable row level security;
drop policy if exists "admin relatorios" on public.relatorios;
create policy "admin relatorios" on public.relatorios for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Junta os números de um imóvel num período. "interno" nunca sai no link do proprietário.
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
                 'proprietario', (select split_part(c.nome, ' ', 1) from public.contatos c where c.id = im.proprietario_id)) from im),
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

-- Link do proprietário: só relatório liberado; tira o que é interno e o investimento se não for para mostrar
create or replace function public.relatorio_publico(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('dados',
      case when coalesce((r.opcoes->>'mostrar_investimento')::boolean, false) then r.dados - 'interno'
           else jsonb_set(r.dados - 'interno', '{anuncios,investimento}', 'null'::jsonb, false) end,
    'texto', r.texto, 'inicio', r.inicio, 'fim', r.fim)
  from public.relatorios r where r.token = p_token and r.status = 'liberado'
$$;
revoke all on function public.relatorio_publico(text) from public;
grant execute on function public.relatorio_publico(text) to anon, authenticated;

-- Todo dia 1: rascunho do mês anterior para cada imóvel à venda com proprietário ligado, e aviso no app
create or replace function public.gerar_relatorios_mensais()
returns int language plpgsql security definer set search_path = public as $$
declare i record; n int := 0; f date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 day')::date; s date := date_trunc('month', f)::date;
begin
  for i in select codigo from public.imoveis where status in ('disponivel','reservado') and proprietario_id is not null loop
    if not exists (select 1 from public.relatorios where imovel_codigo = i.codigo and inicio = s and fim = f) then
      insert into public.relatorios (imovel_codigo, inicio, fim, dados) values (i.codigo, s, f, public.montar_relatorio(i.codigo, s, f));
      n := n + 1;
    end if;
  end loop;
  if n > 0 then
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Relatórios dos proprietários prontos', n || ' relatório(s) para revisar e enviar', '/admin/?aba=relatorios', 'relatorios-' || f);
  end if;
  return n;
end $$;
revoke all on function public.gerar_relatorios_mensais() from public, anon, authenticated;

do $$ begin perform cron.unschedule('relatorios_mensais'); exception when others then null; end $$;
select cron.schedule('relatorios_mensais', '7 11 1 * *', $c$ select public.gerar_relatorios_mensais(); $c$);
