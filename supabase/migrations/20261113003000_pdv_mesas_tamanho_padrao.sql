-- Tamanho fixo por formato de mesa
update checklist.pdv_mesas set largura = case forma when 'retangular' then 170 else 100 end, altura = 100;
