# Agente de WhatsApp (Paggio)

Liga o **WhatsApp Web** do número da casa ao sistema: o **bot** atende reservas e envia o cardápio, e a equipe responde pelo painel (PDV · WhatsApp).

> ⚠️ Usa o WhatsApp Web de forma automatizada (não é a API oficial). Use um número **dedicado da casa**, sem disparo em massa, e mantenha o ritmo moderado (o agente já espaça as mensagens). Para volume alto/campanhas, o caminho recomendado é a WhatsApp Business Platform (API oficial).

## Instalar (PC da casa, ligado durante o horário de atendimento)
1. Instale o Node.js 18+ e o Google Chrome.
2. No sistema: **PDV · Configurações › Tablet e QR Code › Dispositivos** → cadastre um dispositivo do tipo **agente de WhatsApp** e copie o token.
3. Nesta pasta:
```
npm install
$env:WA_FUNCAO_URL="https://jcqpuqhdfveleusjsxeo.supabase.co/functions/v1/wa-bot"
$env:WA_ANON_KEY="<chave publishable/anon do projeto>"
$env:WA_TOKEN_AGENTE="<token copiado>"
node agente.mjs
```
4. Em **PDV · WhatsApp › Conexão** aparece o QR Code. No celular da casa: WhatsApp › Aparelhos conectados › Conectar um aparelho › escaneie.
5. Em **WhatsApp › Bot**, ligue o bot. Pronto: mande "oi" de outro número para testar.

A sessão fica salva na pasta `sessao` (não precisa escanear de novo). Para iniciar com o Windows, use o Agendador de Tarefas (ao iniciar) ou pm2/NSSM.
