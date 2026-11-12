# Agente de impressão (Paggio PDV)

Roda num PC/mini-PC/Raspberry **ligado na mesma rede das 3 impressoras** (caixa, bar, cozinha) e fica ligado durante o serviço.
Pedidos vindos do tablet, do celular do garçom ou do sistema entram numa fila no Supabase; este agente busca e imprime em ESC/POS (TCP 9100).

## Instalar
1. Instale o Node.js 18 ou mais novo no PC do agente.
2. No sistema: PDV · Configurações › Tablet e QR Code › Dispositivos › cadastre "Agente de impressão" (tipo *agente de impressão*) e copie o token.
3. Copie esta pasta para o PC e rode (PowerShell):

```
$env:PDV_FUNCAO_URL="https://jcqpuqhdfveleusjsxeo.supabase.co/functions/v1/pdv-print"
$env:PDV_ANON_KEY="<chave publishable/anon do projeto>"
$env:PDV_TOKEN_AGENTE="<token copiado>"
node agente.mjs
```

4. Em PDV · Configurações › Impressoras cadastre as 3 (IP fixo de cada uma) e use "Imprimir teste".

## Dicas
- Reserve IP fixo (DHCP reservado) para cada impressora.
- Se os acentos saírem errados, troque o *Code page* da impressora (CP860 / CP850 / WPC1252).
- Para iniciar com o Windows: Agendador de Tarefas > "Ao iniciar o computador" executando `node agente.mjs` com as variáveis acima (ou use o NSSM / pm2).
