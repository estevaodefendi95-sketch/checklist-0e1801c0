-- o ticket da cozinha/bar mostra mesa, nº da comanda e nome do cliente
create or replace function checklist.pdv_enfileirar_item() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
declare imp record; m text; ops text; obs_txt text; cmd record;
begin
  if new.tipo <> 'produto' then return new; end if;
  select c.numero, c.nome_cliente, ms.numero as mesa into cmd from checklist.pdv_comandas c left join checklist.pdv_mesas ms on ms.id = c.mesa_id where c.id = new.comanda_id;
  m := cmd.mesa;
  select string_agg(o->>'nome', ', ') into ops from jsonb_array_elements(coalesce(new.opcoes, '[]'::jsonb)) o;
  obs_txt := nullif(concat_ws(' | ', ops, new.obs), '');
  for imp in select id from checklist.pdv_impressoras where funcao = new.destino and ativo loop
    insert into checklist.pdv_fila_impressao(impressora_id, tipo, comanda_id, conteudo)
    values (imp.id, 'pedido', new.comanda_id, jsonb_build_object(
      'mesa', m, 'comanda', cmd.numero, 'cliente', left(cmd.nome_cliente, 24), 'item_id', new.id, 'nome', new.nome, 'qtd', new.qtd, 'obs', obs_txt, 'origem', new.origem,
      'hora', to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI')));
  end loop;
  return new;
end $$;
