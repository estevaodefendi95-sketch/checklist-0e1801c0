-- Conta fechada (aguardando recebimento) não aceita produto novo; só volta a lançar se a comanda for reaberta.
-- Comanda encerrada (fechada) não pode mais ser reaberta.
create or replace function checklist.trg_pdv_item_conta_aberta() returns trigger
language plpgsql set search_path = checklist, public as $$
declare st text;
begin
  if new.tipo is not distinct from 'produto' or new.tipo is null then
    select status into st from checklist.pdv_comandas where id = new.comanda_id;
    if st is not null and st <> 'aberta' then
      raise exception 'Conta fechada: reabra a comanda para lançar novos produtos.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_pdv_item_conta_aberta on checklist.pdv_pedido_itens;
create trigger trg_pdv_item_conta_aberta before insert on checklist.pdv_pedido_itens for each row execute function checklist.trg_pdv_item_conta_aberta();

create or replace function checklist.trg_pdv_comanda_sem_reabrir() returns trigger
language plpgsql set search_path = checklist, public as $$
begin
  if old.status = 'fechada' and new.status in ('aberta','pedindo_conta') then
    raise exception 'Comanda encerrada não pode ser reaberta.';
  end if;
  return new;
end $$;
drop trigger if exists trg_pdv_comanda_sem_reabrir on checklist.pdv_comandas;
create trigger trg_pdv_comanda_sem_reabrir before update of status on checklist.pdv_comandas for each row execute function checklist.trg_pdv_comanda_sem_reabrir();
