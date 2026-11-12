-- Painel de anúncios do admin: entrega diária por anúncio (Meta) e árvore campanha > conjunto > anúncio.
-- Os leads por anúncio vêm da view ads_leads (referral do Click to WhatsApp). Já aplicada no projeto.
create table if not exists public.ads_diario (
  dia date not null,
  anuncio_id text not null,
  anuncio_nome text,
  conjunto_id text, conjunto_nome text,
  campanha_id text, campanha_nome text,
  gasto numeric default 0, impressoes int default 0, alcance int default 0,
  cliques int default 0, cliques_link int default 0, conversas int default 0,
  atualizado_em timestamptz default now(),
  primary key (dia, anuncio_id)
);
create table if not exists public.ads_entidades (
  id text primary key,
  nivel text not null check (nivel in ('campanha','conjunto','anuncio')),
  nome text, pai_id text, status text, status_efetivo text,
  orcamento_diario numeric, thumb text, titulo text, texto text,
  atualizado_em timestamptz default now()
);
alter table public.ads_diario enable row level security;
alter table public.ads_entidades enable row level security;
create policy "admin le ads_diario" on public.ads_diario for select to authenticated using (eh_admin());
create policy "admin le ads_entidades" on public.ads_entidades for select to authenticated using (eh_admin());

create or replace view public.ads_leads with (security_invoker = true) as
select c.contexto->'referral'->>'source_id' as anuncio_id,
       (c.criado_em at time zone 'America/Sao_Paulo')::date as dia,
       c.lead_id, l.etapa, l.termometro_faixa, l.termometro,
       exists (select 1 from visitas v where v.lead_id = c.lead_id) as teve_visita
from conversas c left join leads l on l.id = c.lead_id
where c.contexto->'referral'->>'source_type' = 'ad';
