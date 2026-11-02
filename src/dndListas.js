// ══════════════════════════════════════════════════════════════════════════════
// src/dndListas.js — MAGIAS QUE VÊM DA SUBCLASSE
//
// Tirado das tabelas do Livro do Jogador. A chave é classe:subclasse (e o
// terreno, no Círculo da Terra); dentro, nível → ids de magia.
//
//   clerigo, paladino, druida:terra, patrulheiro:rastreador
//       nível DA CLASSE em que a magia passa a ser sempre conhecida, sem
//       contar no total de magias escolhidas
//   bruxo
//       nível DA MAGIA: a lista expandida só amplia as opções do patrono
// ══════════════════════════════════════════════════════════════════════════════

const LISTAS = {
    'clerigo:conhecimento': { 1: ['comando', 'identificacao'], 3: ['augurio', 'sugestao'], 5: ['dificultar-deteccao', 'falar-com-os-mortos'], 7: ['olho-arcano', 'confusao'], 9: ['conhecimento-lendario', 'videncia'] },
    'clerigo:enganacao': { 1: ['enfeiticar-pessoa', 'disfarcar-se'], 3: ['reflexos', 'passos-sem-pegadas'], 5: ['piscar', 'dissipar-magia'], 7: ['porta-dimensional', 'metamorfose'], 9: ['dominar-pessoa', 'modificar-memoria'] },
    'clerigo:guerra': { 1: ['auxilio-divino', 'escudo-da-fe'], 3: ['arma-magica', 'arma-espiritual'], 5: ['manto-do-cruzado', 'espiritos-guardioes'], 7: ['movimentacao-livre', 'pele-de-pedra'], 9: ['coluna-de-chamas', 'imobilizar-monstro'] },
    'clerigo:luz': { 1: ['maos-flamejantes', 'fogo-das-fadas'], 3: ['esfera-flamejante', 'raio-ardente'], 5: ['luz-do-dia', 'bola-de-fogo'], 7: ['guardiao-da-fe', 'muralha-de-fogo'], 9: ['coluna-de-chamas', 'videncia'] },
    'clerigo:natureza': { 1: ['amizade-animal', 'falar-com-animais'], 3: ['pele-de-arvore', 'crescer-espinhos'], 5: ['ampliar-plantas', 'muralha-de-vento'], 7: ['dominar-besta', 'vinha-esmagadora'], 9: ['praga-de-insetos', 'caminhar-em-arvores'] },
    'clerigo:tempestade': { 1: ['nevoa-obscurecente', 'onda-trovejante'], 3: ['lufada-de-vento', 'despedacar'], 5: ['convocar-relampagos', 'nevasca'], 7: ['controlar-a-agua', 'tempestade-de-gelo'], 9: ['onda-destrutiva', 'praga-de-insetos'] },
    'clerigo:vida': { 1: ['bencao', 'curar-ferimentos'], 3: ['restauracao-menor', 'arma-espiritual'], 5: ['sinal-de-esperanca', 'revivificar'], 7: ['protecao-contra-a-morte', 'guardiao-da-fe'], 9: ['curar-ferimentos-em-massa', 'reviver-os-mortos'] },
    'paladino:devocao': { 3: ['protecao-contra-o-bem-e-mal', 'santuario'], 5: ['restauracao-menor', 'zona-da-verdade'], 9: ['sinal-de-esperanca', 'dissipar-magia'], 13: ['movimentacao-livre', 'guardiao-da-fe'], 17: ['comunhao', 'coluna-de-chamas'] },
    'paladino:ancioes': { 3: ['golpe-constritor', 'falar-com-animais'], 5: ['raio-lunar', 'passo-nebuloso'], 9: ['ampliar-plantas', 'protecao-contra-energia'], 13: ['tempestade-de-gelo', 'pele-de-pedra'], 17: ['comunhao-com-a-natureza', 'caminhar-em-arvores'] },
    'paladino:vinganca': { 3: ['perdicao', 'marca-do-cacador'], 5: ['imobilizar-pessoa', 'passo-nebuloso'], 9: ['velocidade', 'protecao-contra-energia'], 13: ['banimento', 'porta-dimensional'], 17: ['imobilizar-monstro', 'videncia'] },
    'bruxo:arquifada': { 1: ['fogo-das-fadas', 'sono'], 2: ['acalmar-emocoes', 'forca-fantasmagorica'], 3: ['piscar', 'ampliar-plantas'], 4: ['dominar-besta', 'invisibilidade-maior'], 5: ['dominar-pessoa', 'similaridade'] },
    'bruxo:corruptor': { 1: ['maos-flamejantes', 'comando'], 2: ['cegueira-surdez', 'raio-ardente'], 3: ['bola-de-fogo', 'nevoa-fetida'], 4: ['escudo-de-fogo', 'muralha-de-fogo'], 5: ['coluna-de-chamas', 'consagrar'] },
    'bruxo:grande-antigo': { 1: ['sussurros-dissonantes', 'riso-histerico-de-tasha'], 2: ['detectar-pensamentos', 'forca-fantasmagorica'], 3: ['clarividencia', 'enviar-mensagem'], 4: ['dominar-besta', 'tentaculos-negros-de-evard'], 5: ['dominar-pessoa', 'telecinesia'] },
    'druida:terra:artico': { 3: ['imobilizar-pessoa', 'crescer-espinhos'], 5: ['nevasca', 'lentidao'], 7: ['movimentacao-livre', 'tempestade-de-gelo'], 9: ['comunhao-com-a-natureza', 'cone-de-frio'] },
    'druida:terra:costa': { 3: ['passo-nebuloso', 'reflexos'], 5: ['andar-na-agua', 'respirar-na-agua'], 7: ['movimentacao-livre', 'controlar-a-agua'], 9: ['videncia', 'conjurar-elemental'] },
    'druida:terra:deserto': { 3: ['nublar', 'silencio'], 5: ['criar-alimentos', 'protecao-contra-energia'], 7: ['praga', 'terreno-alucinogeno'], 9: ['muralha-de-pedra', 'praga-de-insetos'] },
    'druida:terra:floresta': { 3: ['patas-de-aranha', 'pele-de-arvore'], 5: ['convocar-relampagos', 'ampliar-plantas'], 7: ['adivinhacao', 'movimentacao-livre'], 9: ['comunhao-com-a-natureza', 'caminhar-em-arvores'] },
    'druida:terra:montanha': { 3: ['crescer-espinhos', 'patas-de-aranha'], 5: ['mesclar-se-as-rochas', 'relampago'], 7: ['moldar-rochas', 'pele-de-pedra'], 9: ['criar-passagem', 'muralha-de-pedra'] },
    'druida:terra:pantano': { 3: ['escuridao', 'flecha-acida-de-melf'], 5: ['andar-na-agua', 'nevoa-fetida'], 7: ['movimentacao-livre', 'localizar-criatura'], 9: ['praga-de-insetos', 'videncia'] },
    'druida:terra:planicie': { 3: ['invisibilidade', 'passos-sem-pegadas'], 5: ['luz-do-dia', 'velocidade'], 7: ['adivinhacao', 'movimentacao-livre'], 9: ['praga-de-insetos', 'sonho'] },
    'druida:terra:subterraneo': { 3: ['patas-de-aranha', 'teia'], 5: ['forma-gasosa', 'nevoa-fetida'], 7: ['invisibilidade-maior', 'moldar-rochas'], 9: ['praga-de-insetos', 'nevoa-mortal'] },
    'patrulheiro:rastreador': { 3: ['disfarcar-se'], 5: ['truque-de-corda'], 9: ['glifo-de-vigilancia'], 13: ['invisibilidade-maior'], 17: ['similaridade'] },
}

module.exports = { LISTAS }
