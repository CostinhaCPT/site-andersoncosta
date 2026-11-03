-- 007: lead thermometer (0-100) for the pipeline.
-- Model adapted from public real estate lead-scoring references (financial readiness,
-- timeline, fit, engagement, decision) to the Brazilian purchase process
-- (crédito aprovado, FGTS, venda do imóvel atual, decisores).

alter table public.leads add column if not exists prazo_compra text
  check (prazo_compra in ('ate_3m', '3_6m', '6_12m', 'mais_12m', 'pesquisando'));
alter table public.leads add column if not exists credito text
  check (credito in ('aprovado', 'a_vista', 'fgts_entrada', 'vai_financiar', 'nao_sabe'));
alter table public.leads add column if not exists faixa_max numeric;
alter table public.leads add column if not exists depende_venda boolean;
alter table public.leads add column if not exists decisores_alinhados boolean;
alter table public.leads add column if not exists motivacao_forte boolean;
alter table public.leads add column if not exists ultima_atividade timestamptz default now();
alter table public.leads add column if not exists termometro int;
alter table public.leads add column if not exists termometro_faixa text;
alter table public.leads add column if not exists termometro_detalhe jsonb;
alter table public.leads add column if not exists termometro_em timestamptz;
update public.leads set ultima_atividade = coalesce(atualizado_em, criado_em, now()) where ultima_atividade is null;

create or replace function public.calcular_termometro(l public.leads)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  fin int := 0; prazo int := 0; fit int := 0; eng int := 0; dec int := 0; aj int := 0; inat int := 0;
  total int; faixa text; dias int; v_real int; v_conf int; v_sol int; abriu int := 0;
  falta jsonb := '[]'::jsonb;
begin
  -- Financial readiness (30)
  fin := case l.credito when 'aprovado' then 30 when 'a_vista' then 30 when 'fgts_entrada' then 18
                        when 'vai_financiar' then 10 else 0 end;
  if coalesce(l.depende_venda, false) and coalesce(l.credito, '') <> 'a_vista' then fin := greatest(fin - 8, 0); end if;
  if l.credito is null or l.credito in ('nao_sabe', 'vai_financiar') then
    falta := falta || jsonb_build_object('acao', 'Pergunte sobre crédito e ofereça a simulação: crédito aprovado vale até +20', 'pontos', 30 - fin);
  end if;

  -- Timeline (25)
  prazo := case l.prazo_compra when 'ate_3m' then 25 when '3_6m' then 15 when '6_12m' then 8
                               when 'mais_12m' then 3 when 'pesquisando' then 2 else 0 end;
  if l.prazo_compra is null then
    falta := falta || jsonb_build_object('acao', 'Descubra o prazo e o que motivou a busca agora', 'pontos', 25);
  end if;

  -- Fit and clarity (15)
  if l.faixa_max is not null or nullif(l.faixa_investimento, '') is not null then fit := fit + 5;
  else falta := falta || jsonb_build_object('acao', 'Confirme a faixa de investimento', 'pontos', 5); end if;
  if coalesce(array_length(l.regioes, 1), 0) > 0 then fit := fit + 5;
  else falta := falta || jsonb_build_object('acao', 'Confirme bairros ou região', 'pontos', 5); end if;
  if nullif(l.perfil, '') is not null or coalesce(array_length(l.imoveis_interesse, 1), 0) > 0 then fit := fit + 5; end if;

  -- Engagement (20)
  select count(*) filter (where status = 'realizada'), count(*) filter (where status = 'confirmada'),
         count(*) filter (where status = 'solicitada')
    into v_real, v_conf, v_sol from public.visitas where lead_id = l.id;
  eng := case when v_real > 0 then 15 when v_conf > 0 then 10 when v_sol > 0 then 6 else 0 end;
  if coalesce(array_length(l.imoveis_interesse, 1), 0) > 0 then eng := eng + 3; end if;
  if l.ultima_atividade > now() - interval '3 days' then eng := eng + 4; end if;
  begin
    execute 'select count(*) from public.lp_eventos where lead_id = $1 and tipo in (''abriu'', ''reagiu'')' into abriu using l.id;
  exception when undefined_table then abriu := 0;
  end;
  if abriu > 0 then eng := eng + 5; end if;
  eng := least(eng, 20);
  if v_real + v_conf + v_sol = 0 then
    falta := falta || jsonb_build_object('acao', 'Proponha uma visita: visita confirmada vale +10', 'pontos', 10);
  end if;

  -- Decision (10)
  if coalesce(l.decisores_alinhados, false) then dec := dec + 5;
  else falta := falta || jsonb_build_object('acao', 'Confirme quem decide junto e se todos estão alinhados', 'pontos', 5); end if;
  if coalesce(l.motivacao_forte, false) then dec := dec + 5; end if;

  -- Adjustments
  if nullif(l.outro_corretor, '') is not null and l.outro_corretor !~* '^\s*n[aã]o' then aj := aj - 5; end if;
  if l.canal ilike 'indica%' or l.origem->>'canal' ilike 'indica%' then aj := aj + 5; end if;

  -- Cooling: -5 per week without activity after 21 days (max -30)
  dias := floor(extract(epoch from (now() - coalesce(l.ultima_atividade, l.criado_em, now()))) / 86400);
  if dias > 21 then inat := least(30, 5 * ceil((dias - 21) / 7.0)::int); end if;

  total := greatest(0, least(100, fin + prazo + fit + eng + dec + aj - inat));
  faixa := case when l.etapa in ('venda', 'perdido') then 'encerrado'
                when total >= 70 then 'quente' when total >= 50 then 'morno'
                when total >= 30 then 'frio' else 'gelado' end;
  return jsonb_build_object(
    'total', total, 'faixa', faixa,
    'partes', jsonb_build_object('financeiro', fin, 'prazo', prazo, 'encaixe', fit, 'engajamento', eng,
                                 'decisao', dec, 'ajustes', aj, 'inatividade', -inat),
    'dias_sem_atividade', dias,
    'falta', (select coalesce(jsonb_agg(x order by (x->>'pontos')::int desc), '[]'::jsonb) from jsonb_array_elements(falta) x)
  );
end $$;

create or replace function public.leads_termometro_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.calcular_termometro(new);
  new.termometro := (r->>'total')::int;
  new.termometro_faixa := r->>'faixa';
  new.termometro_detalhe := r;
  new.termometro_em := now();
  new.pontuacao := case r->>'faixa' when 'quente' then 'A' when 'morno' then 'B' when 'frio' then 'C'
                                    when 'gelado' then 'D' else new.pontuacao end;
  return new;
end $$;
drop trigger if exists leads_termometro on public.leads;
create trigger leads_termometro before insert or update on public.leads
  for each row execute function public.leads_termometro_trg();

-- Visits change the score: touch the lead
create or replace function public.visitas_toca_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.leads set ultima_atividade = now() where id = coalesce(new.lead_id, old.lead_id);
  return null;
end $$;
drop trigger if exists visitas_toca_lead on public.visitas;
create trigger visitas_toca_lead after insert or update or delete on public.visitas
  for each row execute function public.visitas_toca_lead();

-- Daily recalculation so cooling applies even without activity
create extension if not exists pg_cron;
select cron.unschedule('termometro_diario') where exists (select 1 from cron.job where jobname = 'termometro_diario');
select cron.schedule('termometro_diario', '15 9 * * *',
  $$update public.leads set termometro_em = now() where coalesce(etapa, 'novo') not in ('venda', 'perdido')$$);

update public.leads set termometro_em = now();
