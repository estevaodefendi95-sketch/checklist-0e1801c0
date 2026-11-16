-- Agrupar pedidos da mesma mesa na cozinha: se outra comanda da mesma mesa pediu há menos de N minutos,
-- o ticket sai com o aviso "AGRUPAR" (conteudo.agrupar). N em pdv_config.agrupar_pedidos_min (0 = desligado).
alter table checklist.pdv_config add column if not exists agrupar_pedidos_min int not null default 10;
-- A função checklist.pdv_enfileirar_item() foi atualizada diretamente no banco (ver trigger trg_pdv_item_fila).
