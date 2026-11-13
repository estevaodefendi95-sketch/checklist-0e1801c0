-- O administrador escolhe quais telas cada usuário enxerga. Usuários que já existem continuam vendo tudo (default true).
alter table checklist.permissoes
  add column if not exists pdv_ver_vendas boolean not null default true,
  add column if not exists pdv_ver_crm boolean not null default true,
  add column if not exists pdv_ver_whatsapp boolean not null default true,
  add column if not exists pdv_ver_consumo boolean not null default true,
  add column if not exists pdv_ver_reservas boolean not null default true;
