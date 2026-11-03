-- 006: mini-CRM, visit scheduling and chat settings editable in the admin.
-- Applied to the project as migration "crm_agenda_config" (2026-10-28).
-- Written idempotently so it can be re-run safely.

-- Settings read by the chatbot (service role) and edited in the admin
create table if not exists public.config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb
);
alter table public.config enable row level security;
drop policy if exists "admin config" on public.config;
create policy "admin config" on public.config for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

insert into public.config (chave, valor) values
  ('chat', '{"ativo":true,"pedir_contato":true,"saudacao":"","instrucoes_extras":""}'),
  ('agenda', '{"dias":[1,2,3,4,5,6],"inicio":"08:00","fim":"18:00","inicio_sabado":"08:00","fim_sabado":"12:00","duracao_min":60,"intervalo_min":30,"antecedencia_horas":12,"janela_dias":14,"ical_url":"","email_avisos":"anderson@paixaocosta.com"}')
on conflict (chave) do nothing;

-- Visits
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  imovel_codigo text,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'solicitada'
    check (status in ('solicitada', 'confirmada', 'recusada', 'cancelada', 'realizada')),
  fora_horario boolean not null default false,
  motivo_validacao text,
  origem text not null default 'chat',
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  confirmada_em timestamptz
);
create index if not exists visitas_inicio_idx on public.visitas (inicio);
create index if not exists visitas_lead_idx on public.visitas (lead_id);
alter table public.visitas enable row level security;
drop policy if exists "admin visitas" on public.visitas;
create policy "admin visitas" on public.visitas for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Properties where the owner must be told before any visit (chat never auto-confirms)
alter table public.imoveis add column if not exists visita_exige_proprietario boolean not null default false;
update public.imoveis set visita_exige_proprietario = true where origem = 'sartori';

-- CRM fields and admin write access to leads
alter table public.leads add column if not exists notas text;
alter table public.leads add column if not exists canal text;
drop policy if exists "admin insere leads" on public.leads;
create policy "admin insere leads" on public.leads for insert to authenticated with check (public.eh_admin());
drop policy if exists "admin apaga leads" on public.leads;
create policy "admin apaga leads" on public.leads for delete to authenticated using (public.eh_admin());
