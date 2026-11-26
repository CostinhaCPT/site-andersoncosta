-- Avisos com tipo (lead, atenção, publicação, Domus, sistema) e histórico: clicar só marca como lido.
alter table public.notificacoes add column if not exists tipo text, add column if not exists lida_em timestamptz;

create or replace function public.notificacoes_classificar() returns trigger language plpgsql as $$
declare t text := coalesce(new.titulo, ''); u text := coalesce(new.url, ''); rot text;
begin
  if new.tipo is null then
    new.tipo := case
      when t ~* '^(novo lead|lead voltou|lead )' or t ~* 'visita|pediu' or u ~* 'pipeline' then 'lead'
      when t ~* 'conversa longa|reprovad|falhou|erro|não conseguiu' or t ~* '^whatsapp ·' then 'atencao'
      when t ~* '^(publicado|agendado|post)' or u ~* 'estudio' then 'publicacao'
      when t ~* 'domus' then 'domus'
      else 'sistema' end;
  end if;
  -- etiqueta no título da notificação do celular, para saber o que é antes de abrir
  rot := case new.tipo when 'lead' then '🟢 LEAD' when 'atencao' then '🟠 ATENÇÃO' when 'publicacao' then '🔵 PUBLICAÇÃO' when 'domus' then '⚪ DOMUS' else '⚪ SISTEMA' end;
  if t not like rot || '%' then new.titulo := left(rot || ' · ' || t, 120); end if;
  return new;
end $$;

drop trigger if exists notificacoes_classificar on public.notificacoes;
create trigger notificacoes_classificar before insert on public.notificacoes
  for each row execute function public.notificacoes_classificar();

update public.notificacoes set tipo = case
  when titulo ~* '^(novo lead|lead voltou|lead )' or titulo ~* 'visita|pediu' or url ~* 'pipeline' then 'lead'
  when titulo ~* 'conversa longa|reprovad|falhou|erro' or titulo ~* '^whatsapp ·' then 'atencao'
  when titulo ~* '^(publicado|agendado|post)' or url ~* 'estudio' then 'publicacao'
  when titulo ~* 'domus' then 'domus'
  else 'sistema' end
where tipo is null;
