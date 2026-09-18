# MoneyMaker

Jogo clicker/incremental em HTML, CSS e JavaScript puro — sem build, sem
dependências de pacote, sem framework.

**Jogar:** https://moneymaker-clicker.vercel.app

## Rodando localmente

O código usa módulos ES, que o navegador só carrega via HTTP (abrir o arquivo
direto pelo `file://` é bloqueado por CORS). Qualquer servidor estático serve:

```bash
npx serve .
```

## Onde mexer

Cada arquivo tem uma responsabilidade só, e os `import` no topo de cada um
declaram de quem ele depende:

| Arquivo | Responsabilidade | Mexa aqui quando quiser... |
|---|---|---|
| `js/config.js` | Dados e tabelas | Rebalancear, adicionar negócio/upgrade/conquista |
| `js/state.js` | Estado e persistência | Mudar o que é salvo, migração de saves |
| `js/utils.js` | Formatação, som, toasts | Formato de números ou notificações |
| `js/vfx.js` | PixiJS e partículas | Efeitos visuais |
| `js/economy.js` | Regras e valores derivados | Custos, renda, multiplicadores, prestígio, automação |
| `js/ui.js` | Renderização do DOM | Cards, modais, lojas, sparkline |
| `js/main.js` | Entrada, eventos, loops | Loop principal, atalhos, ações de botão |
| `css/styles.css` | Estilo | Layout e responsividade (mobile no fim do arquivo) |
| `index.html` | Marcação | Elementos e modais |

### Dependências

```
config  (dados puros, não importa nada)
  └── state  (dados + save/load)
        └── economy  (tudo que é calculado a partir do estado)
              └── ui  (desenha)
                    └── main  (liga eventos e roda os loops)
utils e vfx são folhas, usadas por quem precisar.
```

`config.js` não importa nada de propósito: predicados como `req` e `check`
recebem o estado por parâmetro. É isso que impede o ciclo
`config → state → config`.

Do mesmo jeito, `state.js` só guarda dados — quem calcula multiplicador, renda
ou custo é `economy.js`. Foi essa separação que permitiu o grafo acima.

## Convenções

- **Sem `onclick` inline.** Botões declaram `data-action` (e `data-target`) e um
  único listener em `main.js` despacha pelo mapa `ACTIONS`.
- **Nada no escopo global.** Em `localhost` ou com `?debug` na URL, os módulos
  ficam expostos em `window.MM` para inspeção pelo console.
- **A UI não decide regras.** Quando `ui.js` precisa de um número, chama
  `economy.js`.

## Regras de balanceamento

Duas leis que já foram quebradas e causaram crescimento descontrolado:

1. **O payback de uma unidade precisa ficar bem acima de 1 segundo.** Se um
   negócio se paga em menos que isso, cada compra financia a próxima e a
   economia explode. `COST_GROWTH` (hoje 1.15) precisa crescer mais rápido que
   os multiplicadores de renda somados.
2. **Todo bônus que escala com a quantidade de negócios precisa de teto.**
   Sinergias sem `cap` retroalimentam: mais negócios → mais multiplicador →
   mais negócios.

Para validar uma mudança de balanceamento, simule pelo console com
`window.MM` somando `economy.getRawDPS()` por segundos simulados e confira se a
curva satura em vez de explodir.

## Arquitetura do loop

Simulação e renderização são separadas:

- **Simulação** (`setInterval`, 100ms) usa tempo real decorrido, então continua
  creditando renda com a aba em segundo plano, onde o navegador limita timers.
- **Renderização** (`requestAnimationFrame`) acompanha o monitor e é pausada
  sozinha pelo navegador quando a aba está oculta.

## Moedas

- **Dinheiro** — compra negócios, gerentes e os upgrades de `MONEY_UPGRADES`.
  Reseta a cada prestígio.
- **Pontos de prestígio (💎)** — ganhos ao prestigiar em escala logarítmica
  (`prestigePointsForTotal`), gastos em `PRESTIGE_SHOP`. Nunca resetam.
