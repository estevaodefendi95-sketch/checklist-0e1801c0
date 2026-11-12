-- PDV: horários/visibilidade do cardápio, opções (acompanhamentos/combos/informações),
-- notificações, NF de compra (reajuste de custo) e NF de eventos.

-- ===== 1) Horários e visibilidade (tablet) =====
alter table checklist.pdv_categorias
  add column if not exists visivel_tablet boolean not null default true,
  add column if not exists horario_inicio time,
  add column if not exists horario_fim time,
  add column if not exists dias_semana int[];
alter table checklist.pdv_produtos
  add column if not exists visivel_tablet boolean not null default true,
  add column if not exists horario_inicio time,
  add column if not exists horario_fim time,
  add column if not exists dias_semana int[];

-- dias_semana: 0=dom..6=sáb (vazio = todos). Fim < início = atravessa a meia-noite.
create or replace function checklist.pdv_no_horario(ini time, fim time, dias int[], agora timestamptz default now())
returns boolean language plpgsql stable set search_path = checklist, public as $$
declare
  l timestamp := agora at time zone 'America/Sao_Paulo';
  t time := (agora at time zone 'America/Sao_Paulo')::time;
  hoje int := extract(dow from l)::int;
  ontem int := extract(dow from l - interval '1 day')::int;
  ok_h boolean; ok_o boolean;
begin
  ok_h := dias is null or cardinality(dias) = 0 or hoje = any(dias);
  ok_o := dias is null or cardinality(dias) = 0 or ontem = any(dias);
  if ini is null or fim is null then return ok_h; end if;
  if ini <= fim then return ok_h and t >= ini and t < fim; end if;
  return (ok_h and t >= ini) or (ok_o and t < fim);
end $$;

-- histórico de preço de venda (a troca vale na hora; o histórico fica para auditoria)
create table if not exists checklist.pdv_produto_precos (
  id bigserial primary key,
  produto_id uuid not null references checklist.pdv_produtos(id) on delete cascade,
  preco_anterior numeric, preco numeric not null,
  alterado_por uuid, alterado_em timestamptz not null default now()
);
create or replace function checklist.pdv_log_preco_produto() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if new.preco is distinct from old.preco then
    insert into checklist.pdv_produto_precos(produto_id, preco_anterior, preco, alterado_por) values (new.id, old.preco, new.preco, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_pdv_preco_produto on checklist.pdv_produtos;
create trigger trg_pdv_preco_produto after update of preco on checklist.pdv_produtos for each row execute function checklist.pdv_log_preco_produto();

-- ===== 2) Opções: acompanhamentos, combos, informações (ponto da carne) =====
create table if not exists checklist.pdv_grupos_opcoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'informacao' check (tipo in ('acompanhamento','combo','informacao')),
  min_escolhas int not null default 0 check (min_escolhas >= 0),
  max_escolhas int not null default 1 check (max_escolhas >= 1),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create table if not exists checklist.pdv_opcoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references checklist.pdv_grupos_opcoes(id) on delete cascade,
  nome text not null,
  preco_adicional numeric not null default 0,
  ativo boolean not null default true,
  ordem int not null default 0
);
create table if not exists checklist.pdv_produto_grupos (
  produto_id uuid not null references checklist.pdv_produtos(id) on delete cascade,
  grupo_id uuid not null references checklist.pdv_grupos_opcoes(id) on delete cascade,
  ordem int not null default 0,
  primary key (produto_id, grupo_id)
);
alter table checklist.pdv_pedido_itens add column if not exists opcoes jsonb not null default '[]'::jsonb;

-- a impressão passa a levar as opções escolhidas junto da observação
create or replace function checklist.pdv_enfileirar_item() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
declare imp record; m text; ops text; obs_txt text;
begin
  if new.tipo <> 'produto' then return new; end if;
  select numero into m from checklist.pdv_mesas where id = (select mesa_id from checklist.pdv_comandas where id = new.comanda_id);
  select string_agg(o->>'nome', ', ') into ops from jsonb_array_elements(coalesce(new.opcoes, '[]'::jsonb)) o;
  obs_txt := nullif(concat_ws(' | ', ops, new.obs), '');
  for imp in select id from checklist.pdv_impressoras where funcao = new.destino and ativo loop
    insert into checklist.pdv_fila_impressao(impressora_id, tipo, comanda_id, conteudo)
    values (imp.id, 'pedido', new.comanda_id, jsonb_build_object(
      'mesa', m, 'item_id', new.id, 'nome', new.nome, 'qtd', new.qtd, 'obs', obs_txt, 'origem', new.origem,
      'hora', to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI')));
  end loop;
  return new;
end $$;

-- ===== 3) Notificações =====
create table if not exists checklist.pdv_notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, -- cancelamento | impressao | fiscal | pagamento | sistema
  nivel text not null default 'aviso' check (nivel in ('info','aviso','erro')),
  titulo text not null, mensagem text,
  ref_tabela text, ref_id uuid,
  lida boolean not null default false, lida_por uuid, lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists pdv_notificacoes_lida_idx on checklist.pdv_notificacoes (lida, criado_em desc);

create or replace function checklist.pdv_notificar(p_tipo text, p_nivel text, p_titulo text, p_msg text, p_tab text, p_ref uuid)
returns void language plpgsql security definer set search_path = checklist, public as $$
begin
  insert into checklist.pdv_notificacoes(tipo, nivel, titulo, mensagem, ref_tabela, ref_id) values (p_tipo, p_nivel, p_titulo, p_msg, p_tab, p_ref);
end $$;
revoke all on function checklist.pdv_notificar(text, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function checklist.trg_notif_item_cancelado() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
declare m text; quem text;
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' and coalesce(new.cancelado_motivo, '') <> 'comanda cancelada' then
    select coalesce('Mesa ' || numero, 'Balcão') into m from checklist.pdv_mesas where id = (select mesa_id from checklist.pdv_comandas where id = new.comanda_id);
    select nome into quem from checklist.profiles where id = auth.uid();
    perform checklist.pdv_notificar('cancelamento', 'aviso', 'Item cancelado' || coalesce(' · ' || m, ''),
      new.qtd || '× ' || new.nome || ' (R$ ' || to_char(new.qtd * new.preco_unit, 'FM999990.00') || ') — motivo: ' || coalesce(new.cancelado_motivo, 'não informado') || coalesce(' — por ' || quem, ''),
      'pdv_pedido_itens', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notif_item_cancelado on checklist.pdv_pedido_itens;
create trigger trg_notif_item_cancelado after update of status on checklist.pdv_pedido_itens for each row execute function checklist.trg_notif_item_cancelado();

create or replace function checklist.trg_notif_comanda_cancelada() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
declare m text; quem text;
begin
  if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    select coalesce('Mesa ' || numero, 'Balcão') into m from checklist.pdv_mesas where id = new.mesa_id;
    select nome into quem from checklist.profiles where id = auth.uid();
    perform checklist.pdv_notificar('cancelamento', 'aviso', 'Comanda #' || new.numero || ' cancelada', coalesce(m, 'Balcão') || coalesce(' — por ' || quem, ''), 'pdv_comandas', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notif_comanda_cancelada on checklist.pdv_comandas;
create trigger trg_notif_comanda_cancelada after update of status on checklist.pdv_comandas for each row execute function checklist.trg_notif_comanda_cancelada();

create or replace function checklist.trg_notif_impressao() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
declare nome_imp text;
begin
  if new.status = 'erro' and old.status is distinct from 'erro' then
    select nome into nome_imp from checklist.pdv_impressoras where id = new.impressora_id;
    perform checklist.pdv_notificar('impressao', 'erro', 'Erro de impressão · ' || coalesce(nome_imp, 'impressora'),
      'Tipo: ' || new.tipo || coalesce(' — ' || new.erro, '') || '. Verifique papel, rede e o agente de impressão; depois reenfileire.', 'pdv_fila_impressao', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notif_impressao on checklist.pdv_fila_impressao;
create trigger trg_notif_impressao after update of status on checklist.pdv_fila_impressao for each row execute function checklist.trg_notif_impressao();

create or replace function checklist.trg_notif_nota() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if new.status in ('erro', 'rejeitada') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform checklist.pdv_notificar('fiscal', 'erro', 'NFC-e ' || new.status, coalesce(new.mensagem, 'Veja o detalhe em PDV · Configurações › Fiscal.'), 'pdv_notas', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notif_nota on checklist.pdv_notas;
create trigger trg_notif_nota after insert or update of status on checklist.pdv_notas for each row execute function checklist.trg_notif_nota();

create or replace function checklist.trg_notif_estorno() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if new.estornado and not old.estornado then
    perform checklist.pdv_notificar('pagamento', 'aviso', 'Pagamento estornado', initcap(new.forma) || ' de R$ ' || to_char(new.valor - new.troco, 'FM999990.00'), 'pdv_pagamentos', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notif_estorno on checklist.pdv_pagamentos;
create trigger trg_notif_estorno after update of estornado on checklist.pdv_pagamentos for each row execute function checklist.trg_notif_estorno();

-- ===== 4) NF de compra (entrada) =====
alter table checklist.fornecedores add column if not exists cnpj text, add column if not exists email text;
create table if not exists checklist.nf_compras (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references checklist.fornecedores(id),
  numero text, serie text, chave text,
  emissao date, entrada date not null default current_date,
  total numeric not null default 0, observacao text,
  status text not null default 'rascunho' check (status in ('rascunho','confirmada')),
  criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), confirmada_em timestamptz
);
create unique index if not exists nf_compras_chave_uq on checklist.nf_compras (chave) where chave is not null;
create table if not exists checklist.nf_compra_itens (
  id uuid primary key default gen_random_uuid(),
  nf_id uuid not null references checklist.nf_compras(id) on delete cascade,
  descricao text not null, codigo_fornecedor text,
  insumo_id uuid references checklist.insumos(id),
  qtd numeric not null default 1, unidade_nf text,
  valor_unit numeric not null default 0, valor_total numeric not null default 0,
  fator_conv numeric not null default 1 check (fator_conv > 0), -- unidades do insumo por unidade da NF (ex.: g→kg = 0,001; caixa c/12 un = 12)
  atualizar_preco boolean not null default true,
  preco_anterior numeric, preco_novo numeric
);

create or replace function checklist.nf_pode() returns boolean language sql stable security definer set search_path = checklist, public as $$
  select checklist.pdv_pode('pdv_gerir') or checklist.tem_permissao('lancar_estoque') or checklist.tem_permissao('editar_precos')
$$;

-- Confirma a NF: atualiza o preço dos insumos vinculados (o custo das fichas é calculado a partir deles).
create or replace function checklist.nf_compra_confirmar(p_nf uuid) returns jsonb
language plpgsql security definer set search_path = checklist, public as $$
declare nf record; it record; novo numeric; antigo numeric; res jsonb := '[]'::jsonb; n_fichas int;
begin
  if not checklist.nf_pode() then raise exception 'Sem permissão'; end if;
  select * into nf from checklist.nf_compras where id = p_nf for update;
  if nf.id is null then raise exception 'NF não encontrada'; end if;
  if nf.status = 'confirmada' then raise exception 'NF já confirmada'; end if;
  if exists (select 1 from checklist.nf_compra_itens where nf_id = p_nf and insumo_id is not null and atualizar_preco) and not checklist.tem_permissao('editar_precos') then
    raise exception 'Sem permissão para alterar preços de insumos';
  end if;
  for it in select * from checklist.nf_compra_itens where nf_id = p_nf and insumo_id is not null and atualizar_preco and valor_unit > 0 loop
    novo := round(it.valor_unit / it.fator_conv, 4);
    select preco into antigo from checklist.insumos where id = it.insumo_id;
    update checklist.insumos set preco = novo, fornecedor_id = coalesce(nf.fornecedor_id, fornecedor_id) where id = it.insumo_id;
    update checklist.nf_compra_itens set preco_anterior = antigo, preco_novo = novo where id = it.id;
    select count(distinct ficha_id) into n_fichas from checklist.ficha_itens where insumo_id = it.insumo_id;
    res := res || jsonb_build_object('insumo_id', it.insumo_id, 'descricao', it.descricao, 'antigo', antigo, 'novo', novo, 'fichas', n_fichas);
  end loop;
  update checklist.nf_compras set status = 'confirmada', confirmada_em = now() where id = p_nf;
  return res;
end $$;
revoke all on function checklist.nf_compra_confirmar(uuid) from public, anon;
grant execute on function checklist.nf_compra_confirmar(uuid) to authenticated;

-- ===== 5) NF de eventos (NFS-e) =====
alter table checklist.pdv_fiscal_config
  add column if not exists item_lista_servico text,
  add column if not exists codigo_tributario_municipio text,
  add column if not exists aliquota_iss numeric default 0;
create table if not exists checklist.pdv_eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null, data_evento date,
  tomador_nome text not null, tomador_doc text not null, tomador_email text,
  tomador_cep text, tomador_logradouro text, tomador_numero text, tomador_bairro text, tomador_municipio text, tomador_uf text, tomador_codigo_municipio text,
  descricao_servico text not null, valor numeric not null check (valor > 0),
  status text not null default 'rascunho' check (status in ('rascunho','processando','autorizada','rejeitada','cancelada','manual','erro')),
  referencia text, numero_nota text, nota_url text, mensagem text, resposta jsonb,
  observacao text, criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), atualizado_em timestamptz default now()
);

-- ===== RLS =====
do $$ declare t text; begin
  foreach t in array array['pdv_produto_precos','pdv_grupos_opcoes','pdv_opcoes','pdv_produto_grupos','pdv_notificacoes','nf_compras','nf_compra_itens','pdv_eventos'] loop
    execute format('alter table checklist.%I enable row level security', t);
  end loop;
end $$;
create policy pdv_precos_ler on checklist.pdv_produto_precos for select to authenticated using (checklist.pdv_pode('pdv_gerir'));
create policy pdv_grupos_ler on checklist.pdv_grupos_opcoes for select to authenticated using (checklist.pdv_pode('pdv_operar'));
create policy pdv_grupos_esc on checklist.pdv_grupos_opcoes for all to authenticated using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy pdv_opcoes_ler on checklist.pdv_opcoes for select to authenticated using (checklist.pdv_pode('pdv_operar'));
create policy pdv_opcoes_esc on checklist.pdv_opcoes for all to authenticated using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy pdv_pgrupos_ler on checklist.pdv_produto_grupos for select to authenticated using (checklist.pdv_pode('pdv_operar'));
create policy pdv_pgrupos_esc on checklist.pdv_produto_grupos for all to authenticated using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy pdv_notif_ler on checklist.pdv_notificacoes for select to authenticated using (checklist.pdv_pode('pdv_operar'));
create policy pdv_notif_upd on checklist.pdv_notificacoes for update to authenticated using (checklist.pdv_pode('pdv_operar')) with check (checklist.pdv_pode('pdv_operar'));
create policy nf_compras_all on checklist.nf_compras for all to authenticated using (checklist.nf_pode()) with check (checklist.nf_pode() and status = 'rascunho');
create policy nf_itens_all on checklist.nf_compra_itens for all to authenticated using (checklist.nf_pode()) with check (checklist.nf_pode());
create policy pdv_eventos_all on checklist.pdv_eventos for all to authenticated
  using (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_caixa')) with check (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_caixa'));

grant select, insert, update, delete on checklist.pdv_grupos_opcoes, checklist.pdv_opcoes, checklist.pdv_produto_grupos, checklist.nf_compras, checklist.nf_compra_itens, checklist.pdv_eventos to authenticated;
grant select, update on checklist.pdv_notificacoes to authenticated;
grant select on checklist.pdv_produto_precos to authenticated;
grant usage, select on sequence checklist.pdv_produto_precos_id_seq to authenticated;

alter publication supabase_realtime add table checklist.pdv_notificacoes;
