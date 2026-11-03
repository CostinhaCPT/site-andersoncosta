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
