-- Estrutura de imóveis, base de conhecimento, leads e conversas
-- com busca híbrida (vetorial + texto completo em português).

create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Configuração de busca em português sem acentos
do $$ begin
  if not exists (select 1 from pg_ts_config where cfgname = 'pt_unaccent') then
    create text search configuration pt_unaccent (copy = portuguese);
    alter text search configuration pt_unaccent
      alter mapping for hword, hword_part, word with extensions.unaccent, portuguese_stem;
  end if;
end $$;

-- array_to_string não é imutável; este atalho permite usá-lo em colunas geradas
create or replace function arr_txt(text[]) returns text
language sql immutable parallel safe set search_path = '' as $$ select coalesce(pg_catalog.array_to_string($1, ' '), '') $$;

-- Imóveis --------------------------------------------------------------
create table if not exists imoveis (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,              -- AC-0001
  slug text unique not null,
  status text not null default 'disponivel' check (status in ('rascunho','disponivel','reservado','vendido','oculto')),
  titulo text not null,
  resumo text,
  descricao text,
  destaques text[] default '{}',
  atencao text[] default '{}',
  tipo text not null,                        -- casa, casa-geminada, apartamento, terreno
  cidade text not null default 'Jaraguá do Sul',
  bairro text not null,
  preco numeric,
  preco_visivel boolean default true,
  area numeric, terreno numeric,
  quartos int, suites int, banheiros int, vagas int,
  condominio numeric, iptu numeric,
  aceita_permuta boolean, aceita_financiamento boolean,
  perfil_ideal text,
  fotos jsonb default '[]',
  video text,
  origem text,                               -- proprio, sartori, construtora
  codigo_parceiro text,                      -- interno, nunca exibido
  ref_m2 numeric,
  destaque boolean default false,
  embedding extensions.vector(1536),
  tsv tsvector generated always as (
    setweight(to_tsvector('pt_unaccent', coalesce(titulo,'') || ' ' || coalesce(bairro,'') || ' ' || coalesce(tipo,'')), 'A') ||
    setweight(to_tsvector('pt_unaccent', coalesce(resumo,'') || ' ' || arr_txt(destaques)), 'B') ||
    setweight(to_tsvector('pt_unaccent', coalesce(descricao,'') || ' ' || arr_txt(atencao)), 'C')
  ) stored,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists imoveis_tsv_idx on imoveis using gin (tsv);
create index if not exists imoveis_emb_idx on imoveis using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists imoveis_filtros_idx on imoveis (status, cidade, bairro, tipo, preco, quartos);

-- Base de conhecimento (método, bairros, custos, financiamento, FAQ) ----
create table if not exists conhecimento (
  id uuid primary key default gen_random_uuid(),
  tema text not null,                        -- metodo, bairro, custos, financiamento, faq, politica
  titulo text not null,
  conteudo text not null,
  fonte text,                                -- link ou origem da informação
  revisado_em date,
  embedding extensions.vector(1536),
  tsv tsvector generated always as (
    setweight(to_tsvector('pt_unaccent', coalesce(titulo,'')), 'A') ||
    setweight(to_tsvector('pt_unaccent', coalesce(conteudo,'')), 'B')
  ) stored,
  criado_em timestamptz default now()
);
create index if not exists conhecimento_tsv_idx on conhecimento using gin (tsv);
create index if not exists conhecimento_emb_idx on conhecimento using hnsw (embedding extensions.vector_cosine_ops);

-- Leads, conversas e mensagens ------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nome text, whatsapp text, email text,
  objetivo text,                             -- morar, investir
  regioes text[] default '{}',
  perfil text,
  prazo text, motivacao text,
  faixa_investimento text,
  pagamento text,                            -- financiamento, fgts, a vista, permuta
  tem_imovel_para_vender boolean,
  decisores text, outro_corretor text,
  imoveis_interesse text[] default '{}',
  pontuacao char(1) check (pontuacao in ('A','B','C','D')),
  etapa text not null default 'novo' check (etapa in ('novo','em_conversa','qualificado','curadoria_enviada','visita_agendada','visita_realizada','proposta','venda','perdido')),
  motivo_perda text,
  proxima_acao text, proxima_acao_em timestamptz,
  origem jsonb default '{}',                 -- utm_*, gclid, fbclid, landing, ref
  consentimento_marketing boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists leads_etapa_idx on leads (etapa, pontuacao);

create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  canal text not null check (canal in ('site','whatsapp')),
  status text not null default 'bot' check (status in ('bot','anderson','encerrada')),
  resumo text,
  passada_em timestamptz,
  contexto jsonb default '{}',               -- página, imóvel visto, utm
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists mensagens (
  id bigserial primary key,
  conversa_id uuid not null references conversas(id) on delete cascade,
  papel text not null check (papel in ('usuario','assistente','anderson','sistema','ferramenta')),
  conteudo text not null,
  meta jsonb default '{}',
  criado_em timestamptz default now()
);
create index if not exists mensagens_conversa_idx on mensagens (conversa_id, criado_em);

-- Busca híbrida com Reciprocal Rank Fusion ------------------------------
create or replace function buscar_imoveis_hibrido(
  consulta text,
  consulta_emb extensions.vector(1536),
  f_cidade text default null,
  f_bairros text[] default null,
  f_tipos text[] default null,
  f_preco_min numeric default null,
  f_preco_max numeric default null,
  f_quartos_min int default null,
  limite int default 6,
  k int default 50
) returns setof imoveis
language sql stable set search_path = public, extensions as $$
  with base as (
    select * from imoveis
    where status = 'disponivel'
      and (f_cidade is null or cidade = f_cidade)
      and (f_bairros is null or bairro = any(f_bairros))
      and (f_tipos is null or tipo = any(f_tipos))
      and (f_preco_min is null or preco >= f_preco_min)
      and (f_preco_max is null or preco <= f_preco_max)
      and (f_quartos_min is null or quartos >= f_quartos_min)
  ),
  texto as (
    select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('pt_unaccent', consulta)) desc) as r
    from base where consulta <> '' and tsv @@ websearch_to_tsquery('pt_unaccent', consulta)
    order by 2 limit k
  ),
  vetor as (
    select id, row_number() over (order by embedding <=> consulta_emb) as r
    from base where consulta_emb is not null and embedding is not null
    order by embedding <=> consulta_emb limit k
  ),
  fusao as (
    select coalesce(t.id, v.id) as id,
           coalesce(1.0 / (60 + t.r), 0) + coalesce(1.0 / (60 + v.r), 0) as score
    from texto t full outer join vetor v on t.id = v.id
  )
  select b.* from fusao f join base b on b.id = f.id
  order by f.score desc
  limit limite;
$$;

create or replace function buscar_conhecimento_hibrido(
  consulta text, consulta_emb extensions.vector(1536), limite int default 5, k int default 30
) returns setof conhecimento
language sql stable set search_path = public, extensions as $$
  with texto as (
    select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('pt_unaccent', consulta)) desc) as r
    from conhecimento where tsv @@ websearch_to_tsquery('pt_unaccent', consulta) order by 2 limit k
  ),
  vetor as (
    select id, row_number() over (order by embedding <=> consulta_emb) as r
    from conhecimento where embedding is not null order by embedding <=> consulta_emb limit k
  ),
  fusao as (
    select coalesce(t.id, v.id) as id,
           coalesce(1.0 / (60 + t.r), 0) + coalesce(1.0 / (60 + v.r), 0) as score
    from texto t full outer join vetor v on t.id = v.id
  )
  select c.* from fusao f join conhecimento c on c.id = f.id order by f.score desc limit limite;
$$;

-- Segurança: tudo fechado ao público; só a função de atendimento (service role) acessa.
alter table imoveis enable row level security;
alter table conhecimento enable row level security;
alter table leads enable row level security;
alter table conversas enable row level security;
alter table mensagens enable row level security;

-- O site pode ler imóveis disponíveis (para o catálogo e o painel futuro)
drop policy if exists "imoveis publicos" on imoveis;
create policy "imoveis publicos" on imoveis for select to anon using (status in ('disponivel','reservado'));
