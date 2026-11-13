-- Pedidos lançados sem internet ficam numa fila no aparelho e são reenviados depois.
-- A chave garante que um reenvio nunca duplique o item (e nunca imprima duas vezes).
alter table checklist.pdv_pedido_itens add column if not exists chave_offline text;
alter table checklist.pdv_pedido_itens add constraint pdv_pedido_itens_chave_offline_uq unique (chave_offline);
