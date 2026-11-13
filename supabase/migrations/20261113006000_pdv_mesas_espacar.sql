-- Afasta as mesas já desenhadas (40%) para não ficarem coladas com o tamanho padrão por formato
update checklist.pdv_mesas set pos_x = round(pos_x * 1.4 / 10) * 10, pos_y = round(pos_y * 1.4 / 10) * 10;
