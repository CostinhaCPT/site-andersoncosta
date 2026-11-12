-- Corrige "tuple to be updated was already modified": marcar um lead como "não contatar" atualizava o contato,
-- e o gatilho do contato tentava atualizar o mesmo lead de novo. Só propaga quando a mudança nasce no contato.
create or replace function public.contatos_trava_trg() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.nao_contatar and not old.nao_contatar then
    update public.leads set nao_contatar = true, nao_contatar_motivo = coalesce(nao_contatar_motivo, 'contato marcado não contatar')
      where contato_id = new.id and not nao_contatar;
  end if;
  return new;
end $$;
