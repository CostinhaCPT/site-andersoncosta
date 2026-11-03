-- 008: landing pages built in the admin (curadoria for a lead, campanha for ads)
create table if not exists public.lps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  tipo text not null check (tipo in ('curadoria', 'campanha')),
  nome text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  lead_id uuid references public.leads(id) on delete set null,
  hero jsonb not null default '{}'::jsonb,
  blocos jsonb not null default '[]'::jsonb,
  opcoes jsonb not null default '{}'::jsonb,
  variante_de uuid references public.lps(id) on delete set null,
  variante text,
  expira_em timestamptz,
  publicada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists lps_lead_idx on public.lps (lead_id);

create table if not exists public.lp_eventos (
  id bigserial primary key,
  lp_id uuid not null references public.lps(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  tipo text not null,
  dados jsonb not null default '{}'::jsonb,
  sessao text,
  criado_em timestamptz not null default now()
);
create index if not exists lp_eventos_lp_idx on public.lp_eventos (lp_id, tipo, criado_em);
create index if not exists lp_eventos_lead_idx on public.lp_eventos (lead_id);

alter table public.lps enable row level security;
alter table public.lp_eventos enable row level security;
drop policy if exists "admin lps" on public.lps;
create policy "admin lps" on public.lps for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists "admin lp_eventos" on public.lp_eventos;
create policy "admin lp_eventos" on public.lp_eventos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Public read of one published page, with the listings it references.
-- Off-market listings (rascunho) are allowed so a curadoria can show them; sold/hidden never.
create or replace function public.lp_publica(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with lp as (
    select * from public.lps
    where slug = p_slug and status = 'publicada' and (expira_em is null or expira_em > now())
  ), cods as (
    select distinct upper(c) as codigo from lp,
      lateral jsonb_path_query(lp.blocos, '$[*].dados.itens[*].codigo') as x(c0),
      lateral (select c0 #>> '{}') as y(c)
    union
    select distinct upper(c) from lp,
      lateral jsonb_path_query(lp.blocos, '$[*].dados.codigo') as x(c0),
      lateral (select c0 #>> '{}') as y(c)
  )
  select case when not exists (select 1 from lp) then null else jsonb_build_object(
    'id', lp.id, 'slug', lp.slug, 'tipo', lp.tipo, 'hero', lp.hero, 'blocos', lp.blocos, 'opcoes', lp.opcoes,
    'variante', lp.variante,
    'primeiro_nome', (select split_part(l.nome, ' ', 1) from public.leads l where l.id = lp.lead_id),
    'imoveis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', i.codigo, 'slug', i.slug, 'status', i.status, 'titulo', i.titulo, 'resumo', i.resumo, 'descricao', i.descricao,
        'destaques', i.destaques, 'atencao', i.atencao, 'tipo', i.tipo, 'cidade', i.cidade, 'bairro', i.bairro, 'preco', i.preco,
        'preco_visivel', i.preco_visivel, 'area', i.area, 'terreno', i.terreno, 'quartos', i.quartos, 'suites', i.suites,
        'banheiros', i.banheiros, 'vagas', i.vagas, 'condominio', i.condominio, 'iptu', i.iptu, 'aceita_permuta', i.aceita_permuta,
        'aceita_financiamento', i.aceita_financiamento, 'fotos', i.fotos, 'video', i.video, 'ref_m2', i.ref_m2, 'ref_amostra', i.ref_amostra))
      from public.imoveis i
      where i.codigo in (select codigo from cods) and i.status in ('disponivel', 'reservado', 'rascunho')
    ), '[]'::jsonb)
  ) end
  from (select 1) d left join lp on true
$$;
revoke all on function public.lp_publica(text) from public;
grant execute on function public.lp_publica(text) to anon, authenticated;
