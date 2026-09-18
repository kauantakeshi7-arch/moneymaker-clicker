// Referências de DOM e escrita com verificação de mudança.
//
// O render roda a cada frame: buscar os mesmos elementos e reescrever texto
// idêntico custava recálculo de estilo à toa.


// Referências de DOM resolvidas uma vez. O loop roda 10×/s: buscar os mesmos
// ~60 elementos por frame era puro desperdício.
export const el = {};
const CACHED_IDS = ['moneyDisplay','totalEarned','clickCount','comboDisplay','comboValue','multValue',
    'businessCount','prestigeDisplay','mpsDisplay','nextPrestigeCost','timeToPrestige','prestigeBtn',
    'prestigeProgressFill','prestigeProgressLabel','upgradeBadge','prestigePointBadge','chartContainer',
    'upgradesContainer','achBadge','aiToggle','soundToggle','skylineCount'];

export function cacheDomRefs() {
    for (const id of CACHED_IDS) el[id] = document.getElementById(id);
}

// Escreve só quando o valor muda: atribuir textContent igual ainda custa recálculo de estilo.
export function setText(node, value) {
    if (node && node._last !== value) { node.textContent = value; node._last = value; }
}

export function setHtml(node, value) {
    if (node && node._last !== value) { node.innerHTML = value; node._last = value; }
}

