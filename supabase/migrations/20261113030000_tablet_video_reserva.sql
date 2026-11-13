-- Vídeo no produto/ficha (o tablet usa a foto/vídeo da ficha técnica quando o produto não tem os próprios)
alter table checklist.fichas add column if not exists video_url text;
alter table checklist.pdv_produtos add column if not exists video_url text;
-- Reserva marcada no próprio tablet (nome da reserva)
alter table checklist.pdv_mesas add column if not exists reservado_nome text;
alter table checklist.pdv_mesas add column if not exists reservado_em timestamptz;
-- Buckets aceitam vídeo (até 60 MB)
update storage.buckets set file_size_limit = 62914560, allowed_mime_types = null where id in ('fichas','tablet');
