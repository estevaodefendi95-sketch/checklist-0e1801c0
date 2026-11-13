-- Check-in: o funcionário escolhe quais cobranças (couvert / rodízio) lançar. p_cobrancas null = todas as do dia (compatível).
drop function if exists checklist.pdv_aplicar_perfis(uuid, jsonb);
create or replace function checklist.pdv_aplicar_perfis(p_comanda uuid, p_perfis jsonb, p_cobrancas uuid[] default null)
returns void language plpgsql security definer set search_path to 'checklist', 'public' as $function$
declare
  dow int := extract(dow from (now() at time zone 'America/Sao_Paulo'))::int;
  r record; c record; total_pessoas int := 0;
begin
  if not checklist.pdv_pode('pdv_operar') then raise exception 'sem permissão'; end if;
  if not exists (select 1 from checklist.pdv_comandas where id=p_comanda and status in ('aberta','pedindo_conta')) then
    raise exception 'comanda não está aberta';
  end if;
  delete from checklist.pdv_comanda_perfis where comanda_id=p_comanda;
  delete from checklist.pdv_pedido_itens where comanda_id=p_comanda and tipo in ('couvert','rodizio');
  for r in select (e->>'perfil_id')::uuid pid, (e->>'qtd')::int qtd from jsonb_array_elements(coalesce(p_perfis,'[]'::jsonb)) e loop
    continue when r.qtd is null or r.qtd <= 0;
    insert into checklist.pdv_comanda_perfis(comanda_id,perfil_id,qtd) values (p_comanda,r.pid,r.qtd);
    total_pessoas := total_pessoas + r.qtd;
  end loop;
  for c in select * from checklist.pdv_cobrancas
           where ativo and valor > 0 and dow = any(dias_semana) and (p_cobrancas is null or id = any(p_cobrancas))
           order by ordem, nome loop
    for r in select cp.qtd, p.nome, p.percentual from checklist.pdv_comanda_perfis cp join checklist.pdv_perfis p on p.id=cp.perfil_id where cp.comanda_id=p_comanda loop
      continue when r.percentual <= 0;
      insert into checklist.pdv_pedido_itens(comanda_id,nome,qtd,preco_unit,destino,origem,status,tipo,cobranca_id,obs)
      values (p_comanda, c.nome || ' (' || r.nome || ')', r.qtd, round(c.valor * r.percentual / 100, 2), 'caixa', 'sistema', 'entregue', c.tipo, c.id, null);
    end loop;
  end loop;
  if total_pessoas > 0 then update checklist.pdv_comandas set pessoas = total_pessoas where id=p_comanda; end if;
end $function$;
grant execute on function checklist.pdv_aplicar_perfis(uuid, jsonb, uuid[]) to authenticated;
