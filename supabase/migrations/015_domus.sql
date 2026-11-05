-- 015: parceria Domus. A função "domus" lê o site público da Domus duas vezes por dia (6h13 e 18h13),
-- cria os imóveis novos como rascunho (CRM), atualiza preço e tira do ar o que foi vendido.
-- Os imóveis a partir de R$ 800 mil com fotos limpas (Drive) ficam "disponível" no site; os demais ficam só no CRM.
-- Já aplicado direto no banco em 04/11/2026; este arquivo é o registro.
do $$ begin perform cron.unschedule('domus_sincronizar'); exception when others then null; end $$;
select cron.schedule('domus_sincronizar', '13 9,21 * * *', $c$
  select net.http_post(url := 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/domus',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('token', (select valor->>'token' from public.config where chave = 'cron')),
    timeout_milliseconds := 300000);
$c$);
