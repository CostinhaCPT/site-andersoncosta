-- 010: CRM no estilo HubSpot, adaptado para consumidor final
-- Contato (a pessoa) -> Negócio (cada oportunidade). Empresa é opcional.
-- A tabela "leads" continua sendo o negócio: robô, termômetro, agenda e follow-up seguem iguais.

-- 1. Empresas (opcional: holding, construtora, imobiliária parceira) ------------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text,                       -- holding | construtora | imobiliaria | parceiro | outro
  documento text,
  telefone text,
  email text,
  site text,
  notas text,
  campos jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2. Contatos: só o nome OU o telefone é obrigatório -----------------------------
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  nome text,
  whatsapp text,
  email text,
  telefone2 text,
  empresa_id uuid references public.empresas(id) on delete set null,
  papeis text[] not null default '{}',      -- comprador | proprietario | investidor | parceiro | indicador
  cidade text,
  bairro text,
  aniversario date,
  origem jsonb not null default '{}'::jsonb,
  canal text,
  indicado_por uuid references public.contatos(id) on delete set null,
  consentimento_marketing boolean not null default false,
  nao_contatar boolean not null default false,
  notas text,
  campos jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contato_tem_nome_ou_fone check (coalesce(nullif(trim(nome), ''), nullif(whatsapp, ''), nullif(email, '')) is not null)
);
create index if not exists contatos_whatsapp on public.contatos (whatsapp);
create index if not exists contatos_email on public.contatos (lower(email));
create index if not exists contatos_empresa on public.contatos (empresa_id);

-- 3. Negócio = leads, com funil, valor e comissão --------------------------------
alter table public.leads add column if not exists contato_id uuid references public.contatos(id) on delete set null;
alter table public.leads add column if not exists empresa_id uuid references public.empresas(id) on delete set null;
alter table public.leads add column if not exists funil text not null default 'compra';
alter table public.leads add column if not exists titulo text;
alter table public.leads add column if not exists valor numeric;
alter table public.leads add column if not exists comissao_pct numeric not null default 5;
alter table public.leads add column if not exists imovel_codigo text;      -- imóvel principal do negócio (na captação, o imóvel do proprietário)
alter table public.leads add column if not exists fechado_em timestamptz;
alter table public.leads add column if not exists campos jsonb not null default '{}'::jsonb;
create index if not exists leads_contato on public.leads (contato_id);

alter table public.leads drop constraint if exists leads_funil_check;
alter table public.leads add constraint leads_funil_check check (funil in ('compra', 'captacao'));
alter table public.leads drop constraint if exists leads_etapa_check;
alter table public.leads add constraint leads_etapa_check check (etapa in (
  'novo','em_conversa','qualificado','curadoria_enviada','visita_agendada','visita_realizada','proposta',
  'cap_contato','cap_avaliacao','cap_acm','cap_negociacao','cap_autorizado','cap_anunciado',
  'venda','perdido'));

-- 4. Imóvel ligado ao proprietário ------------------------------------------------
alter table public.imoveis add column if not exists proprietario_id uuid references public.contatos(id) on delete set null;
alter table public.imoveis add column if not exists captacao_id uuid references public.leads(id) on delete set null;

-- 5. Atividades (linha do tempo manual: nota, ligação, reunião, e-mail, WhatsApp) -
create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid references public.contatos(id) on delete cascade,
  negocio_id uuid references public.leads(id) on delete cascade,
  tipo text not null default 'nota',   -- nota | ligacao | reuniao | email | whatsapp | sistema
  titulo text,
  corpo text,
  quando timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists atividades_contato on public.atividades (contato_id, quando desc);
create index if not exists atividades_negocio on public.atividades (negocio_id, quando desc);

-- 6. Tarefas ---------------------------------------------------------------------
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  tipo text not null default 'tarefa', -- tarefa | ligar | whatsapp | email | visita | documento
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta')),
  vence_em timestamptz,
  concluida_em timestamptz,
  contato_id uuid references public.contatos(id) on delete cascade,
  negocio_id uuid references public.leads(id) on delete cascade,
  imovel_codigo text,
  origem text not null default 'manual',
  criado_em timestamptz not null default now()
);
create index if not exists tarefas_abertas on public.tarefas (vence_em) where concluida_em is null;

-- 7. Campos personalizados (você cria sem código) -----------------------------------
create table if not exists public.campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  objeto text not null check (objeto in ('contato','negocio','empresa','imovel')),
  chave text not null,
  rotulo text not null,
  tipo text not null default 'texto' check (tipo in ('texto','numero','moeda','data','opcao','sim_nao')),
  opcoes text[] not null default '{}',
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  unique (objeto, chave)
);
alter table public.imoveis add column if not exists campos jsonb not null default '{}'::jsonb;

-- 8. Listas salvas (filtros) -------------------------------------------------------
create table if not exists public.listas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  objeto text not null default 'contato',
  filtros jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- RLS: tudo só para admin
do $$ declare t text; begin
  foreach t in array array['empresas','contatos','atividades','tarefas','campos_personalizados','listas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin %s" on public.%I', t, t);
    execute format('create policy "admin %s" on public.%I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t, t);
  end loop;
end $$;

-- 9. Todo negócio novo ganha contato (acha pelo WhatsApp ou e-mail, ou cria) ----------
create or replace function public.leads_contato_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if new.contato_id is null then
    if coalesce(new.whatsapp, '') <> '' then
      select id into c from public.contatos where whatsapp = new.whatsapp order by criado_em limit 1;
    end if;
    if c is null and coalesce(new.email, '') <> '' then
      select id into c from public.contatos where lower(email) = lower(new.email) order by criado_em limit 1;
    end if;
    if c is null and coalesce(nullif(trim(new.nome), ''), nullif(new.whatsapp, ''), nullif(new.email, '')) is not null then
      insert into public.contatos (nome, whatsapp, email, origem, canal, consentimento_marketing, papeis)
        values (new.nome, new.whatsapp, new.email, coalesce(new.origem, '{}'::jsonb), new.canal,
                coalesce(new.consentimento_marketing, false),
                case when new.funil = 'captacao' then array['proprietario'] else array['comprador'] end)
        returning id into c;
    end if;
    new.contato_id := c;
  elsif tg_op = 'UPDATE' and new.contato_id = old.contato_id then
    -- o robô aprende nome e e-mail no negócio: completa o contato sem sobrescrever
    update public.contatos set
      nome = coalesce(nullif(trim(nome), ''), new.nome),
      email = coalesce(nullif(email, ''), new.email),
      whatsapp = coalesce(nullif(whatsapp, ''), new.whatsapp),
      nao_contatar = nao_contatar or coalesce(new.nao_contatar, false),
      atualizado_em = now()
    where id = new.contato_id
      and (nome is distinct from coalesce(nullif(trim(nome), ''), new.nome)
        or email is distinct from coalesce(nullif(email, ''), new.email)
        or whatsapp is distinct from coalesce(nullif(whatsapp, ''), new.whatsapp)
        or (coalesce(new.nao_contatar, false) and not nao_contatar));
  end if;
  if new.etapa in ('venda','perdido') and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
    new.fechado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists leads_contato on public.leads;
create trigger leads_contato before insert or update on public.leads
  for each row execute function public.leads_contato_trg();

-- 10. Termômetro só faz sentido no funil de compra
create or replace function public.leads_termometro_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if new.funil = 'captacao' then
    new.termometro := null; new.termometro_faixa := null; new.termometro_detalhe := null;
    return new;
  end if;
  r := public.calcular_termometro(new);
  new.termometro := (r->>'total')::int;
  new.termometro_faixa := r->>'faixa';
  new.termometro_detalhe := r;
  new.termometro_em := now();
  new.pontuacao := case r->>'faixa' when 'quente' then 'A' when 'morno' then 'B' when 'frio' then 'C'
                                    when 'gelado' then 'D' else new.pontuacao end;
  return new;
end $$;

-- 11. Contato marcado "não contatar" trava todos os negócios dele
create or replace function public.contatos_trava_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nao_contatar and not old.nao_contatar then
    update public.leads set nao_contatar = true, nao_contatar_motivo = coalesce(nao_contatar_motivo, 'contato marcado não contatar')
      where contato_id = new.id and not nao_contatar;
  end if;
  return new;
end $$;
drop trigger if exists contatos_trava on public.contatos;
create trigger contatos_trava after update on public.contatos
  for each row execute function public.contatos_trava_trg();

-- 12. Migração: cada lead atual ganha seu contato (o gatilho faz o trabalho)
update public.leads set atualizado_em = atualizado_em where contato_id is null;

-- 13. Juntar duplicados: move tudo do contato B para o A e apaga o B
create or replace function public.mesclar_contatos(p_manter uuid, p_apagar uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'acesso negado'; end if;
  if p_manter = p_apagar then return; end if;
  update public.contatos a set
    nome = coalesce(nullif(trim(a.nome), ''), b.nome), whatsapp = coalesce(nullif(a.whatsapp, ''), b.whatsapp),
    email = coalesce(nullif(a.email, ''), b.email), telefone2 = coalesce(a.telefone2, b.telefone2),
    empresa_id = coalesce(a.empresa_id, b.empresa_id), papeis = (select array(select distinct unnest(a.papeis || b.papeis))),
    notas = nullif(concat_ws(E'\n\n', a.notas, b.notas), ''), campos = b.campos || a.campos,
    nao_contatar = a.nao_contatar or b.nao_contatar, atualizado_em = now()
  from public.contatos b where a.id = p_manter and b.id = p_apagar;
  update public.leads set contato_id = p_manter where contato_id = p_apagar;
  update public.atividades set contato_id = p_manter where contato_id = p_apagar;
  update public.tarefas set contato_id = p_manter where contato_id = p_apagar;
  update public.imoveis set proprietario_id = p_manter where proprietario_id = p_apagar;
  update public.contatos set indicado_por = p_manter where indicado_por = p_apagar;
  insert into public.atividades (contato_id, tipo, titulo, corpo)
    select p_manter, 'sistema', 'Contato mesclado', coalesce(nome, whatsapp, email) from public.contatos where id = p_apagar;
  delete from public.contatos where id = p_apagar;
end $$;
revoke all on function public.mesclar_contatos(uuid, uuid) from public, anon;
grant execute on function public.mesclar_contatos(uuid, uuid) to authenticated;
