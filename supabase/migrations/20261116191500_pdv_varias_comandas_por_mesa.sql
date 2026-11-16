-- Várias comandas abertas na mesma mesa (o tablet é só cardápio/disparo de pedido; a comanda é o que vale).
drop index if exists checklist.pdv_uma_comanda_aberta_por_mesa;
create index if not exists pdv_comandas_mesa_abertas on checklist.pdv_comandas (mesa_id) where status in ('aberta','pedindo_conta');
