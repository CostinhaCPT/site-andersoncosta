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
