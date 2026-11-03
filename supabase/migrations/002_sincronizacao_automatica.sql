-- Sincronização automática: quando um imóvel ou texto da base de conhecimento
-- é criado ou alterado, o Supabase chama sozinho a indexação do chatbot.

create extension if not exists pg_net with schema extensions;

create or replace function imoveis_marcar_reindexar() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
       new.titulo is distinct from old.titulo or new.resumo is distinct from old.resumo or
       new.descricao is distinct from old.descricao or new.destaques is distinct from old.destaques or
       new.atencao is distinct from old.atencao or new.tipo is distinct from old.tipo or
       new.bairro is distinct from old.bairro or new.cidade is distinct from old.cidade or
       new.preco is distinct from old.preco or new.area is distinct from old.area or
       new.terreno is distinct from old.terreno or new.quartos is distinct from old.quartos or
       new.suites is distinct from old.suites or new.vagas is distinct from old.vagas or
       new.perfil_ideal is distinct from old.perfil_ideal) then
    new.embedding := null;
    new.atualizado_em := now();
  end if;
  return new;
end $$;

create or replace function conhecimento_marcar_reindexar() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.titulo is distinct from old.titulo or new.conteudo is distinct from old.conteudo) then
    new.embedding := null;
  end if;
  return new;
end $$;

create or replace function chamar_indexacao() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento',
    body := '{"acao":"indexar"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  return null;
end $$;
revoke execute on function chamar_indexacao() from anon, authenticated, public;

drop trigger if exists imoveis_reindexar on imoveis;
create trigger imoveis_reindexar before update on imoveis
  for each row execute function imoveis_marcar_reindexar();
drop trigger if exists imoveis_indexar on imoveis;
create trigger imoveis_indexar after insert or update on imoveis
  for each row when (new.embedding is null) execute function chamar_indexacao();

drop trigger if exists conhecimento_reindexar on conhecimento;
create trigger conhecimento_reindexar before update on conhecimento
  for each row execute function conhecimento_marcar_reindexar();
drop trigger if exists conhecimento_indexar on conhecimento;
create trigger conhecimento_indexar after insert or update on conhecimento
  for each row when (new.embedding is null) execute function chamar_indexacao();

