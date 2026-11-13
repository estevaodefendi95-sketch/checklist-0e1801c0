-- Endereço público do sistema passou de checklistpaggio.lovable.app para sistemapaggio.lovable.app
update checklist.wa_config set link_base = 'https://sistemapaggio.lovable.app' where link_base ilike '%checklistpaggio%';
alter table checklist.wa_config alter column link_base set default 'https://sistemapaggio.lovable.app';
update checklist.pdv_config set tablet_url_base = 'https://sistemapaggio.lovable.app' where id = 1 and (tablet_url_base is null or tablet_url_base ilike '%checklistpaggio%');
update checklist.pdv_vapid set assunto = 'https://sistemapaggio.lovable.app' where assunto ilike '%checklistpaggio%';
alter table checklist.pdv_vapid alter column assunto set default 'https://sistemapaggio.lovable.app';
