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
