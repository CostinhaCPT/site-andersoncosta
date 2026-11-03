-- Limpeza mensal de áudios e fotos com mais de 90 dias (dia 1, às 4h)
create extension if not exists pg_cron;
select cron.unschedule('limpar-anexos') where exists (select 1 from cron.job where jobname = 'limpar-anexos');
select cron.schedule('limpar-anexos', '0 7 1 * *', $$
  select net.http_post(
    url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento',
    body := '{"acao":"limpar"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
$$);
