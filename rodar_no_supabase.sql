-- Rode este arquivo inteiro de uma vez no SQL Editor do Supabase (1: WhatsApp e travas, 2: CRM, 3: app e voz, 4: Estúdio)
-- 009: WhatsApp Cloud API, travas de contato e motor de follow-up
-- Regra de ouro: ninguém recebe mensagem automática sem passar por todas as travas
-- no momento do envio. Na dúvida, não envia.

-- 1. Travas no lead -----------------------------------------------------------
alter table public.leads add column if not exists nao_contatar boolean not null default false;
alter table public.leads add column if not exists nao_contatar_motivo text;
alter table public.leads add column if not exists automacao_pausada_ate timestamptz;

-- 2. Lista de supressão permanente por telefone (sobrevive a lead apagado ou duplicado)
create table if not exists public.supressao (
  fone text primary key,
  motivo text not null,
  origem text not null default 'manual',
  criado_em timestamptz not null default now()
);
alter table public.supressao enable row level security;
drop policy if exists "admin supressao" on public.supressao;
create policy "admin supressao" on public.supressao for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- 3. Fila de follow-up: uma linha por toque, com chave única (nunca duplica)
create table if not exists public.followup_fila (
  id bigserial primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  cadencia text not null default 'sem_resposta',
  episodio timestamptz not null,            -- última mensagem da pessoa que abriu o silêncio
  passo int not null,
  faixa text not null,                      -- manha | tarde | noite
  agendado_para timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente','enviado','ensaio','manual','cancelado','bloqueado','falhou')),
  motivo text,
  modo text,                                -- ensaio | teste | real
  forma text,                               -- texto (janela 24h) | template
  template text,
  texto text,
  wamid text,
  respondeu_em timestamptz,
  criado_em timestamptz not null default now(),
  executado_em timestamptz,
  unique (lead_id, cadencia, episodio, passo)
);
create index if not exists followup_fila_pendentes on public.followup_fila (agendado_para) where status = 'pendente';
create index if not exists followup_fila_lead on public.followup_fila (lead_id, criado_em desc);
alter table public.followup_fila enable row level security;
drop policy if exists "admin followup" on public.followup_fila;
create policy "admin followup" on public.followup_fila for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- 4. Registro de auditoria de tudo que a automação decide
create table if not exists public.automacao_log (
  id bigserial primary key,
  lead_id uuid references public.leads(id) on delete set null,
  evento text not null,
  detalhe jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists automacao_log_evento on public.automacao_log (evento, criado_em desc);
alter table public.automacao_log enable row level security;
drop policy if exists "admin automacao_log" on public.automacao_log;
create policy "admin automacao_log" on public.automacao_log for select to authenticated using (public.eh_admin());

-- 5. Mensagens de WhatsApp: ids da Meta para não processar duas vezes
create unique index if not exists mensagens_wamid on public.mensagens ((meta->>'wamid')) where meta ? 'wamid';
create index if not exists conversas_canal on public.conversas (canal, atualizado_em desc);

-- Admin pode mudar status da conversa (assumir / devolver ao robô)
drop policy if exists "admin atualiza conversas" on public.conversas;
create policy "admin atualiza conversas" on public.conversas for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- 6. Gatilho: mudou etapa, marcou não contatar ou pausou → cancela tudo que está na fila
create or replace function public.followup_cancelar_por_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if new.nao_contatar and not coalesce(old.nao_contatar, false) then v_motivo := 'nao_contatar';
  elsif new.etapa is distinct from old.etapa
    and new.etapa in ('visita_agendada','visita_realizada','proposta','venda','perdido') then v_motivo := 'etapa:' || new.etapa;
  elsif new.automacao_pausada_ate is not null and new.automacao_pausada_ate > now()
    and (old.automacao_pausada_ate is null or old.automacao_pausada_ate <= now()) then v_motivo := 'pausado';
  end if;
  if v_motivo is not null then
    update public.followup_fila set status = 'cancelado', motivo = v_motivo, executado_em = now()
      where lead_id = new.id and status = 'pendente';
    if found then
      insert into public.automacao_log (lead_id, evento, detalhe) values (new.id, 'cancelado', jsonb_build_object('motivo', v_motivo));
    end if;
  end if;
  if new.nao_contatar and not coalesce(old.nao_contatar, false) and new.whatsapp is not null then
    insert into public.supressao (fone, motivo, origem) values (new.whatsapp, coalesce(new.nao_contatar_motivo, 'não contatar'), 'lead')
      on conflict (fone) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists leads_followup_cancelar on public.leads;
create trigger leads_followup_cancelar after update on public.leads
  for each row execute function public.followup_cancelar_por_lead();

-- 7. Gatilho: a pessoa respondeu ou o Anderson escreveu → cancela a fila e marca resposta
create or replace function public.followup_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lead uuid;
begin
  if new.papel not in ('usuario','anderson') then return new; end if;
  select lead_id into v_lead from public.conversas where id = new.conversa_id;
  if v_lead is null then return new; end if;
  update public.followup_fila set status = 'cancelado',
      motivo = case when new.papel = 'usuario' then 'respondeu' else 'humano_escreveu' end, executado_em = now()
    where lead_id = v_lead and status = 'pendente';
  if new.papel = 'usuario' then
    -- atribui a resposta ao último toque enviado nos últimos 3 dias (taxa de resposta por faixa)
    update public.followup_fila set respondeu_em = now()
      where id = (select id from public.followup_fila where lead_id = v_lead and status in ('enviado','manual')
                    and respondeu_em is null and executado_em > now() - interval '3 days'
                  order by executado_em desc limit 1);
  end if;
  return new;
end $$;
drop trigger if exists mensagens_followup on public.mensagens;
create trigger mensagens_followup after insert on public.mensagens
  for each row execute function public.followup_mensagem();

-- 8. Configuração padrão: tudo DESLIGADO e em modo ensaio
insert into public.config (chave, valor) values
  ('automacao', jsonb_build_object(
    'ativo', false, 'modo', 'ensaio', 'max_toques', 4, 'janela_dias', 10, 'intervalo_h', 48,
    'primeiro_apos_h', 18, 'teto_dia', 30, 'janela_inicio', '08:00', 'janela_fim', '21:00',
    'max_optout_dia', 3, 'numeros_teste', jsonb_build_array('5547989133845'),
    'templates', jsonb_build_object('1', 'retomada_atendimento', '2', 'opcoes_curadoria', '3', 'retomada_visita', '4', 'encerramento_contato'),
    'idioma', 'pt_BR')),
  ('whatsapp', jsonb_build_object('ativo', false, 'modo_teste', true, 'numeros_teste', jsonb_build_array('5547989133845'))),
  ('cron', jsonb_build_object('token', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')))
on conflict (chave) do nothing;

-- 9. Relógio: a cada 10 minutos a função avalia e executa a fila
do $$ begin
  perform cron.unschedule('followup_tick');
exception when others then null; end $$;
select cron.schedule('followup_tick', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('acao', 'followup_tick', 'token', (select valor->>'token' from public.config where chave = 'cron')),
    timeout_milliseconds := 55000
  );
$cron$);

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

-- 011: app instalável (notificações) e registro de atendimento por voz (Siri, Apple Watch, iPhone, Mac)

-- Chaves privadas que só as funções do servidor leem (sem nenhuma política: nem o admin lê pelo navegador)
create table if not exists public.cofre (
  chave text primary key,
  valor jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.cofre enable row level security;

-- Aparelhos que recebem notificação
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  chaves jsonb not null,
  dispositivo text,
  criado_em timestamptz not null default now(),
  ultimo_ok timestamptz
);

-- Tokens pessoais dos atalhos (guardamos só o hash; o token aparece uma vez na tela)
create table if not exists public.tokens_pessoais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  hash text not null unique,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogado boolean not null default false
);

-- Registros falados: aplicados direto ou à espera da sua confirmação
create table if not exists public.registros_voz (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  origem text,
  interpretacao jsonb not null default '{}'::jsonb,
  candidatos jsonb not null default '[]'::jsonb,
  status text not null default 'revisar' check (status in ('aplicado','revisar','descartado')),
  contato_id uuid references public.contatos(id) on delete set null,
  negocio_id uuid references public.leads(id) on delete set null,
  resposta text,
  criado_em timestamptz not null default now(),
  aplicado_em timestamptz
);
create index if not exists registros_voz_revisar on public.registros_voz (criado_em desc) where status = 'revisar';

-- Fila de notificações (qualquer parte do sistema insere aqui; um gatilho dispara o envio)
create table if not exists public.notificacoes (
  id bigserial primary key,
  titulo text not null,
  corpo text,
  url text not null default '/admin/',
  chave text unique,                 -- evita notificar duas vezes a mesma coisa
  criado_em timestamptz not null default now(),
  enviada_em timestamptz
);

alter table public.tarefas add column if not exists notificada_em timestamptz;

do $$ declare t text; begin
  foreach t in array array['push_inscricoes','tokens_pessoais','registros_voz','notificacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin %s" on public.%I', t, t);
    execute format('create policy "admin %s" on public.%I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t, t);
  end loop;
end $$;

-- Ao entrar uma notificação, chama a função que envia para os aparelhos
create or replace function public.notificacoes_enviar_trg() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/app',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('acao', 'enviar', 'token', (select valor->>'token' from public.config where chave = 'cron')),
    timeout_milliseconds := 20000);
  return null;
end $$;
drop trigger if exists notificacoes_enviar on public.notificacoes;
create trigger notificacoes_enviar after insert on public.notificacoes
  for each statement execute function public.notificacoes_enviar_trg();

-- Eventos que geram notificação ---------------------------------------------------
create or replace function public.notificar_visita_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if new.status = 'solicitada' then
    select coalesce(nome, 'Lead') into n from public.leads where id = new.lead_id;
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Pedido de visita para validar', coalesce(n, 'Lead') || ' · ' || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || coalesce(' · ' || new.imovel_codigo, ''), '/admin/', 'visita-' || new.id)
      on conflict (chave) do nothing;
  elsif new.status = 'confirmada' and tg_op = 'INSERT' then
    select coalesce(nome, 'Lead') into n from public.leads where id = new.lead_id;
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Visita agendada pelo robô', coalesce(n, 'Lead') || ' · ' || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || coalesce(' · ' || new.imovel_codigo, ''), '/admin/', 'visita-' || new.id)
      on conflict (chave) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists notificar_visita on public.visitas;
create trigger notificar_visita after insert on public.visitas for each row execute function public.notificar_visita_trg();

create or replace function public.notificar_quente_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.termometro_faixa = 'quente' and old.termometro_faixa is distinct from 'quente' then
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Lead quente: ' || coalesce(new.nome, 'sem nome'), 'Termômetro ' || new.termometro || '. Vale falar com ele hoje.', '/admin/', 'quente-' || new.id || '-' || to_char(now(), 'YYYYMMDD'))
      on conflict (chave) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists notificar_quente on public.leads;
create trigger notificar_quente after update on public.leads for each row execute function public.notificar_quente_trg();

create or replace function public.notificar_revisao_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'revisar' then
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Confirme um registro', left(coalesce(new.resposta, new.texto), 140), '/admin/?aba=tarefas', 'voz-' || new.id)
      on conflict (chave) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists notificar_revisao on public.registros_voz;
create trigger notificar_revisao after insert on public.registros_voz for each row execute function public.notificar_revisao_trg();

-- Lembretes: tarefas que vencem e resumo das visitas de amanhã
create or replace function public.gerar_lembretes() returns void
language plpgsql security definer set search_path = public as $$
declare r record; agora_br timestamp := now() at time zone 'America/Sao_Paulo'; n int;
begin
  for r in select t.id, t.titulo, t.vence_em, c.nome from public.tarefas t left join public.contatos c on c.id = t.contato_id
           where t.concluida_em is null and t.notificada_em is null and t.vence_em between now() - interval '1 hour' and now() + interval '20 minutes' loop
    insert into public.notificacoes (titulo, corpo, url, chave)
      values ('Tarefa: ' || r.titulo, coalesce(r.nome || ' · ', '') || to_char(r.vence_em at time zone 'America/Sao_Paulo', 'HH24:MI'), '/admin/?aba=tarefas', 'tarefa-' || r.id)
      on conflict (chave) do nothing;
    update public.tarefas set notificada_em = now() where id = r.id;
  end loop;
  if extract(hour from agora_br) = 19 and extract(minute from agora_br) < 15 then
    select count(*) into n from public.visitas
      where status in ('confirmada','solicitada') and (inicio at time zone 'America/Sao_Paulo')::date = (agora_br::date + 1);
    if n > 0 then
      insert into public.notificacoes (titulo, corpo, url, chave)
        values ('Amanhã: ' || n || case when n = 1 then ' visita' else ' visitas' end, 'Confirme com os clientes com um toque na Agenda.', '/admin/?aba=agenda', 'amanha-' || to_char(agora_br, 'YYYYMMDD'))
        on conflict (chave) do nothing;
    end if;
  end if;
end $$;
do $$ begin perform cron.unschedule('lembretes'); exception when others then null; end $$;
select cron.schedule('lembretes', '*/15 * * * *', $c$select public.gerar_lembretes()$c$);

-- 012: Estúdio do Imóvel (criativos, publicação no Instagram e Facebook, métricas, anúncios e comentário que vira mensagem)

-- Peças criadas no Estúdio
create table if not exists public.criativos (
  id uuid primary key default gen_random_uuid(),
  imovel_codigo text,
  tipo text not null check (tipo in ('carrossel','post','story','reel')),
  titulo text,
  arquivos jsonb not null default '[]'::jsonb,       -- [{url, caminho, tipo: imagem|video}]
  legenda text,
  redes text[] not null default '{instagram}',      -- instagram | facebook
  status text not null default 'rascunho' check (status in ('rascunho','agendado','publicando','publicado','erro','arquivado')),
  agendado_para timestamptz,
  publicado_em timestamptz,
  ig_media_id text,
  ig_permalink text,
  fb_post_id text,
  erro text,
  metricas jsonb not null default '{}'::jsonb,
  metricas_em timestamptz,
  palavra_chave text,                               -- comentário com esta palavra recebe mensagem automática
  resposta_dm text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists criativos_agenda on public.criativos (agendado_para) where status = 'agendado';
create index if not exists criativos_imovel on public.criativos (imovel_codigo, criado_em desc);

-- Anúncios criados pelo Estúdio (sempre nascem pausados)
create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  imovel_codigo text,
  criativo_id uuid references public.criativos(id) on delete set null,
  nome text not null,
  orcamento_dia numeric not null,
  dias int not null default 7,
  raio_km int not null default 25,
  idade_min int not null default 28,
  idade_max int not null default 65,
  texto text,
  campanha_id text, conjunto_id text, anuncio_id text,
  status text not null default 'rascunho' check (status in ('rascunho','criado_pausado','ativo','pausado','erro','encerrado')),
  erro text,
  metricas jsonb not null default '{}'::jsonb,
  metricas_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Retrato diário do perfil (seguidores, alcance)
create table if not exists public.perfil_metricas (
  dia date primary key,
  dados jsonb not null default '{}'::jsonb
);

-- Comentários respondidos com mensagem automática (nunca responde duas vezes o mesmo)
create table if not exists public.comentarios_dm (
  comentario_id text primary key,
  criativo_id uuid references public.criativos(id) on delete set null,
  ig_usuario text,
  texto text,
  respondido boolean not null default false,
  erro text,
  criado_em timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['criativos','anuncios','perfil_metricas','comentarios_dm'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin %s" on public.%I', t, t);
    execute format('create policy "admin %s" on public.%I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t, t);
  end loop;
end $$;

-- Relógio: publica o que está agendado (a cada 5 min) e atualiza métricas (a cada 6 h)
do $$ begin perform cron.unschedule('estudio_publicar'); exception when others then null; end $$;
select cron.schedule('estudio_publicar', '*/5 * * * *', $c$
  select net.http_post(url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/meta',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('acao', 'publicar_agendados', 'token', (select valor->>'token' from public.config where chave = 'cron')),
    timeout_milliseconds := 120000)
  where exists (select 1 from public.criativos where status = 'agendado' and agendado_para <= now() + interval '5 minutes');
$c$);
do $$ begin perform cron.unschedule('estudio_metricas'); exception when others then null; end $$;
select cron.schedule('estudio_metricas', '20 */6 * * *', $c$
  select net.http_post(url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/meta',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('acao', 'metricas', 'token', (select valor->>'token' from public.config where chave = 'cron')),
    timeout_milliseconds := 120000);
$c$);

