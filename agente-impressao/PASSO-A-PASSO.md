# Impressão do Paggio — passo a passo (para quem cuida do computador da casa)

**Para que serve:** o sistema fica na internet e não enxerga as impressoras da casa. Este programa pequeno fica ligado num computador **dentro da mesma rede (Wi-Fi/cabo) das 3 impressoras** (Caixa, Bar e Cozinha), busca os pedidos e as contas e manda imprimir. Se ele estiver desligado, **nada imprime** (os pedidos ficam esperando na fila).

**Qual computador usar:** um PC (ou mini-PC) que fique **ligado durante todo o serviço**. Não precisa ser potente.

## Parte 1 — Uma vez só (preparar)
1. **Instalar o Node.js:** entre em nodejs.org, baixe a versão **LTS** e instale (Avançar, Avançar…).
2. **Copiar a pasta `agente-impressao`** para o computador (por exemplo, para a Área de Trabalho).
3. **Criar o "token" do agente** (feito por um administrador no sistema):
   PDV › Config › **Gestão do Tablet** (Tablet e QR Code) › Dispositivos › cadastrar **"Agente de impressão"**, tipo *agente de impressão*, e **copiar o token** gerado.
4. **Colar o token:** clique com o botão direito em `iniciar-agente.bat` › **Editar**. Troque `COLE_O_TOKEN_AQUI` pelo token copiado e salve.

## Parte 2 — Ligar
5. Dê **dois cliques em `iniciar-agente.bat`**. Vai abrir uma janela preta; **deixe ela aberta** (pode minimizar). Se aparecer erro, a janela explica o que falta.
6. Para abrir sozinho sempre que o computador ligar, dê dois cliques em **`instalar-inicio-windows.bat`**.

## Parte 3 — Conferir as impressoras
7. As impressoras precisam ter **IP fixo** (peça ao responsável pelo roteador para "reservar o IP" de cada uma). Hoje o sistema espera:
   - Caixa — 192.168.24.200
   - Bar — 192.168.24.201
   - Cozinha — 192.168.24.202
   (porta 9100 em todas). Se algum IP for diferente, corrija em PDV › Config › **Impressoras**.
8. Em PDV › Config › Impressoras, clique em **"Imprimir teste"** em cada uma. Deve sair um papel de teste.
9. Se os acentos saírem trocados (ex.: "ç" virando símbolo), mude o *Code page* da impressora entre CP860, CP850 e WPC1252.

## Teste final
- No celular: abra uma comanda, lance um item (deve sair na Cozinha ou no Bar) e clique em **Fechar conta** (deve sair a pré-conta no Caixa).
- Se nada sai: confira se a janela preta continua aberta, se o computador está na mesma rede das impressoras e se os IPs estão certos.

## Regras de ouro
- **Computador desligado ou sem rede = não imprime.**
- Se uma impressão não sair, o sistema avisa na tela e dá para **Reimprimir** (pré-conta) ou levar o pedido à mão.
