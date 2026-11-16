-- Modelos de opções importados do Goomer (nomes ajustados, duplicados unificados) e vinculados aos produtos.
do $$
declare
  ord int := (select coalesce(max(ordem),0) from checklist.pdv_grupos_opcoes);
  gid uuid;
  i int;
  r record;
  m jsonb;
  modelos jsonb := $j$[
  {"n":"Cebola no burguer","t":"informacao","min":1,"max":1,"o":[["Com cebola",0],["Sem cebola",0]],"p":["Burguer da casa"]},
  {"n":"Acompanhamentos extras","t":"acompanhamento","min":0,"max":6,"o":[["Arroz branco",5],["Arroz integral",5],["Feijão",5],["Legumes clássicos",8],["Batata rústica",14.9],["Farofa de banana da terra",5]],"p":["Burguer da casa"]},
  {"n":"Adicionais do burguer","t":"acompanhamento","min":0,"max":2,"o":[["Molho cheddar",2],["Bacon",3]],"p":["Burguer da casa"]},
  {"n":"Ponto da carne","t":"informacao","min":1,"max":1,"o":[["Mal passada",0],["Ao ponto",0],["Bem passada",0]],"p":["Ancho do cheff","Filé a poivre","Filé Alfredo","Filé mignon com aligot","Filé recheado do cheff","Prato kids — filé mignon","Paggio Fit — ancho","Burguer da casa","JK Filé Casal","Tábua de ancho","Tábua de picanha","Tábua do Bife","Tábua do Bife (meia)","Tábua de ancho com gorgonzola cremoso"]},
  {"n":"Colarinho do chopp","t":"informacao","min":1,"max":1,"o":[["Com colarinho",0],["Sem colarinho",0]],"p":["Chopp Antarctica","Chopp Antarctica — Happy Hour"]},
  {"n":"Especiarias no gin","t":"informacao","min":1,"max":1,"o":[["Com especiarias",0],["Sem especiarias",0]],"p":["Gin tradicional com especiarias","Gin Tropical","Gin com limão siciliano"]},
  {"n":"Açúcar da caipirinha","t":"informacao","min":1,"max":1,"o":[["Com açúcar",0],["Sem açúcar",0]],"p":["@cat:Caipirinhas"]},
  {"n":"Destilado da caipirinha","t":"acompanhamento","min":1,"max":1,"o":[["Velho Barreiro",0],["Sagatiba",3],["Vodka Smirnoff",5],["Vodka Absolut",13],["Saquê",5]],"p":["@cat:Caipirinhas"]},
  {"n":"Salada no prato","t":"informacao","min":1,"max":1,"o":[["Com salada",0],["Sem salada",0]],"p":["Paggio Fit — ancho","Paggio Fit — frango","Paggio Fit — salmão","Paggio Fit — tilápia"]},
  {"n":"Copo","t":"informacao","min":0,"max":4,"o":[["Copo",0],["Copo com gelo",0]],"p":["Guaraná","Guaraná Zero","Pepsi","Pepsi Black","H2O Limão","H2O Limoneto","Red Bull Sugar Free","Red Bull Tradicional","Red Bull Tropical"]},
  {"n":"Copo para água tônica","t":"acompanhamento","min":0,"max":4,"o":[["Copo",0],["Copo com gelo",0],["Copo com laranja",0],["Copo com laranja e gelo",0],["Copo com limão e gelo",1.5],["Copo com limão espremido e gelo",1.5]],"p":["Água tônica","Água tônica Zero"]},
  {"n":"Gelo na dose","t":"informacao","min":0,"max":1,"o":[["Sem gelo",0],["Com gelo",0]],"p":["@cat:Doses"]},
  {"n":"Sabor do pastel","t":"acompanhamento","min":2,"max":2,"o":[["Pastel de queijo",0],["Pastel de alho-poró",0],["Pastel de carne",5]],"p":["Mix de pastel"]},
  {"n":"Acompanhamento do prato","t":"informacao","min":0,"max":2,"o":[["Feijão cozido",0],["Legumes clássicos brasileiros",0],["Batata frita",0],["Batata rústica",0],["Brócolis alho e óleo",0],["Farofa de banana da terra",0],["Purê de batatas",0]],"p":["Paggio Fit — ancho","Paggio Fit — frango","Paggio Fit — salmão","Paggio Fit — tilápia"]},
  {"n":"Acompanhamento kids","t":"informacao","min":0,"max":1,"o":[["Feijão cozido",0],["Batata frita",0],["Brócolis",0]],"p":["Prato kids — filé mignon","Prato kids — frango"]},
  {"n":"Base do prato","t":"informacao","min":0,"max":1,"o":[["Arroz branco",0],["Arroz integral",0],["Talharim ao molho de tomate",0]],"p":["Paggio Fit — ancho","Paggio Fit — frango","Paggio Fit — salmão","Paggio Fit — tilápia"]},
  {"n":"Base kids","t":"informacao","min":0,"max":1,"o":[["Arroz branco",0],["Talharim ao molho de tomate",0]],"p":["Prato kids — filé mignon","Prato kids — frango"]},
  {"n":"Proteína do talharim","t":"informacao","min":1,"max":1,"o":[["Sem proteína",0],["Mignon",0],["Tilápia",0]],"p":["Talharim ao molho de tomates"]},
  {"n":"Gin do combo","t":"informacao","min":1,"max":1,"o":[["Gordon's 750ml",0],["Tanqueray",5]],"p":["Combo Gin"]}
  ]$j$::jsonb;
begin
  for m in select * from jsonb_array_elements(modelos) loop
    if exists (select 1 from checklist.pdv_grupos_opcoes where nome = m->>'n') then continue; end if;
    ord := ord + 1;
    insert into checklist.pdv_grupos_opcoes(nome,tipo,min_escolhas,max_escolhas,ordem) values (m->>'n', m->>'t', (m->>'min')::int, (m->>'max')::int, ord) returning id into gid;
    i := 0;
    for r in select * from jsonb_array_elements(m->'o') loop
      insert into checklist.pdv_opcoes(grupo_id,nome,preco_adicional,ordem) values (gid, r.value->>0, (r.value->>1)::numeric, i); i := i + 1;
    end loop;
    i := 0;
    for r in select * from jsonb_array_elements_text(m->'p') loop
      if r.value like '@cat:%' then
        insert into checklist.pdv_produto_grupos(produto_id,grupo_id,ordem)
          select p.id, gid, coalesce((select count(*) from checklist.pdv_produto_grupos x where x.produto_id=p.id),0)
          from checklist.pdv_produtos p join checklist.pdv_categorias c on c.id=p.categoria_id where c.nome = substr(r.value,6) on conflict do nothing;
      else
        insert into checklist.pdv_produto_grupos(produto_id,grupo_id,ordem)
          select p.id, gid, coalesce((select count(*) from checklist.pdv_produto_grupos x where x.produto_id=p.id),0)
          from checklist.pdv_produtos p where p.nome = r.value on conflict do nothing;
      end if;
    end loop;
  end loop;
end $$;
