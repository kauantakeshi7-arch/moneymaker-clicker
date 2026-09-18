# MoneyMaker

Jogo clicker/incremental em HTML, CSS e JavaScript puro — sem build, sem dependências
de pacote. Abrir o `index.html` já roda.

**Jogar:** https://moneymaker-clicker.vercel.app

## Onde mexer

O código é dividido por responsabilidade para que cada tipo de alteração toque um
arquivo só:

| Arquivo | Responsabilidade | Mexa aqui quando quiser... |
|---|---|---|
| `js/config.js` | Dados e tabelas | Rebalancear economia, adicionar negócio/upgrade/conquista |
| `js/state.js` | Estado e persistência | Mudar o que é salvo, migração de saves, validação |
| `js/utils.js` | Formatação, som, toasts | Mudar formato de números ou notificações |
| `js/vfx.js` | PixiJS e partículas | Mexer em efeitos visuais |
| `js/economy.js` | Regras do jogo | Alterar custos, renda, compras, prestígio, automação |
| `js/ui.js` | Renderização do DOM | Mudar cards, modais, lojas |
| `js/main.js` | Init, atalhos, loop | Mexer no loop principal ou atalhos |
| `css/styles.css` | Estilo | Layout e responsividade (mobile no fim do arquivo) |
| `index.html` | Marcação | Adicionar elementos ou modais |

Os scripts carregam nessa ordem no `index.html` e compartilham escopo global — não há
sistema de módulos, então qualquer função é visível entre arquivos.

## Regras de balanceamento

Duas leis que já foram quebradas antes e causaram crescimento descontrolado:

1. **Payback de uma unidade precisa ficar bem acima de 1 segundo.** Se um negócio se
   paga em menos que isso, cada compra financia a próxima e a economia explode.
   O custo (`COST_GROWTH`, hoje 1.15) precisa crescer mais rápido que os
   multiplicadores de renda somados.
2. **Todo bônus que escala com a quantidade de negócios precisa de teto.** Sinergias
   sem limite criam retroalimentação: mais negócios → mais multiplicador → mais
   negócios.

Para validar mudanças de balanceamento, rode uma simulação no console do navegador
somando `getRawDPS()` por segundos simulados e confira se a curva satura em vez de
explodir.

## Moedas

- **Dinheiro** — compra negócios, gerentes e os upgrades de `MONEY_UPGRADES`. Reseta
  a cada prestígio.
- **Pontos de prestígio (💎)** — ganhos ao prestigiar em escala logarítmica
  (`prestigePointsForTotal`), gastos em `PRESTIGE_SHOP`. Nunca resetam.
