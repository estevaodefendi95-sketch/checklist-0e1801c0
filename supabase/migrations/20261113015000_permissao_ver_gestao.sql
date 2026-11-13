-- O administrador escolhe quem vê o modo Gestão no celular (checklists, estoque, fichas, custos…).
-- Quem não tiver fica só no modo Atendimento. Usuários existentes continuam vendo tudo.
alter table checklist.permissoes add column if not exists pdv_ver_gestao boolean not null default true;
