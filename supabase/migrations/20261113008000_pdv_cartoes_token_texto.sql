-- O QR dos cartões já impressos pode ter qualquer conteúdo: o código passa a ser texto livre.
alter table checklist.pdv_cartoes alter column token drop default;
alter table checklist.pdv_cartoes alter column token type text using token::text;
alter table checklist.pdv_cartoes alter column token set default gen_random_uuid()::text;
