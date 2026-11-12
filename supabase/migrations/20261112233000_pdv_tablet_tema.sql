alter table checklist.pdv_config add column if not exists tablet_tema jsonb not null default '{"primaria":"#7a1f2b","fundo":"#faf7f2","texto":"#222222","destaque":"#c9a24b","titulo":"Paggio","subtitulo":"","colunas":1,"mostrar_fotos":true}'::jsonb;

-- funções de gatilho não precisam ser chamáveis pela API
revoke execute on function checklist.trg_notif_item_cancelado(), checklist.trg_notif_comanda_cancelada(), checklist.trg_notif_impressao(), checklist.trg_notif_nota(), checklist.trg_notif_estorno(), checklist.pdv_log_preco_produto() from public, anon, authenticated;
revoke execute on function checklist.nf_pode(), checklist.nf_compra_confirmar(uuid) from public, anon;
grant execute on function checklist.nf_pode(), checklist.nf_compra_confirmar(uuid) to authenticated;
