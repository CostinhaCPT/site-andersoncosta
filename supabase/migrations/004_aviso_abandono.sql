-- A cada 15 minutos: avisa por e-mail quem deixou o contato e parou de responder há 30 min
select cron.unschedule('avisar-abandonos') where exists (select 1 from cron.job where jobname = 'avisar-abandonos');
select cron.schedule('avisar-abandonos', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento',
    body := '{"acao":"abandonos"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
$$);
