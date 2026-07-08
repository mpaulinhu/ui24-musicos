// ============================================================================
//  CONFIGURACAO GERAL  -  edite este arquivo para adaptar a sua igreja
// ============================================================================
//
//  Aqui voce define:
//    1) O IP da sua mesa Ui24R (ou o simulador)
//    2) A porta do SEU servidor (a que os musicos vao acessar)
//    3) Quantos canais existem na mesa
//    4) Os musicos, o aux (fone) de cada um e quais canais ele controla
//
//  Depois de editar, basta reiniciar o servidor (npm start).
// ============================================================================

// ----------------------------------------------------------------------------
//  LISTA DE CANAIS DA MESA (mapeada dos rotulos reais da Ui24R)
//  CH da mesa - 1 = id aqui. Todos os fones usam esta mesma lista.
//  Se quiser que um musico veja MENOS canais, e so criar uma lista propria
//  para ele em vez de usar 'canaisTodos'.
//
//  "parceiro": para canais que sao um PAR ESTEREO (ex: microfone/overhead em
//  L+R), aponta para o id do outro lado do par. A interface do musico move os
//  dois faders juntos quando o musico mexe em qualquer um dos dois.
//
//  "tipo"/"canalMesa": canais especiais que NAO fazem parte da numeracao
//  normal 1-24 da mesa (ex: Line In). "id" e' so o identificador interno
//  (usado pela interface/protocolo do app); "canalMesa" e' o indice REAL na
//  mesa dentro do seu proprio "tipo". Se omitidos, tipo="i" e canalMesa=id
//  (comportamento padrao dos canais normais abaixo).
// ----------------------------------------------------------------------------
const canaisTodos = [
  { id: 0,  nome: 'Guitarra' },                    // CH 1
  { id: 1,  nome: 'Baixo' },                       // CH 2
  { id: 2,  nome: 'Talk' },                        // CH 3
  { id: 3,  nome: 'Pratos L', parceiro: 4 },       // CH 4  (estereo com CH 5)
  { id: 4,  nome: 'Pratos R', parceiro: 3 },       // CH 5  (estereo com CH 4)
  { id: 5,  nome: 'Caixa' },                       // CH 6
  { id: 6,  nome: 'Bumbo' },                       // CH 7
  { id: 7,  nome: 'Tom' },                         // CH 8
  { id: 8,  nome: 'Surdo' },                       // CH 9
  { id: 9,  nome: 'Teclado 1', parceiro: 10 },     // CH 10 (estereo com CH 11)
  { id: 10, nome: 'Teclado 2', parceiro: 9 },      // CH 11 (estereo com CH 10)
  { id: 11, nome: 'Teclado 3' },                   // CH 12 (mono, independente)
  { id: 12, nome: 'Azul' },                        // CH 13
  { id: 13, nome: 'Verde' },                       // CH 14
  { id: 14, nome: 'Amarelo' },                     // CH 15
  { id: 15, nome: 'Vermelho' },                    // CH 16
  { id: 16, nome: 'Branco' },                      // CH 17
  { id: 17, nome: 'Coringa' },                     // CH 18
  { id: 18, nome: 'Condensador L', parceiro: 19 }, // CH 19 (estereo com CH 20)
  { id: 19, nome: 'Condensador R', parceiro: 18 }, // CH 20 (estereo com CH 19)
  // Line In (entrada RCA do PC) — nao faz parte dos 24 canais normais da
  // mesa; usa o tipo "l" (l.0/l.1 no protocolo), ja estereo.
  { id: 20, nome: 'Line In L', tipo: 'l', canalMesa: 0, parceiro: 21 },
  { id: 21, nome: 'Line In R', tipo: 'l', canalMesa: 1, parceiro: 20 },
];

export const config = {
  // --------------------------------------------------------------------------
  //  CONEXAO COM A MESA
  // --------------------------------------------------------------------------
  //  IP e porta da Ui24R na rede da igreja.
  //  - Para testar em casa com o SIMULADOR, use: host '127.0.0.1', porta 8001
  //  - Na igreja, troque para o IP real da mesa e porta 80.
  mesa: {
    host: '192.168.100.201', // <-- TROCAR pelo IP da mesa na igreja (ex: '192.168.1.100')
    port: 80,        // <-- Na igreja normalmente e 80
  },

  // --------------------------------------------------------------------------
  //  SERVIDOR (o SEU) - a porta que os musicos vao abrir no navegador
  // --------------------------------------------------------------------------
  //  Ex: se o PC da igreja tem IP 192.168.1.50, os musicos acessam:
  //      http://192.168.1.50:3000/musico
  servidor: {
    port: 3000,
  },

  // --------------------------------------------------------------------------
  //  QUANTIDADE DE CANAIS DE ENTRADA DA MESA
  // --------------------------------------------------------------------------
  //  A Ui24R tem 24 canais de entrada (indices 0..23 no protocolo).
  totalCanais: 24,

  // --------------------------------------------------------------------------
  //  AUXES / VIAS DE FONE
  // --------------------------------------------------------------------------
  //  A Ui24R tem 10 saidas aux (indices 0..9 no protocolo).
  //  Cada musico usa um aux como fone individual.
  totalAuxes: 10,

  // --------------------------------------------------------------------------
  //  MUSICOS
  // --------------------------------------------------------------------------
  //  Cada musico tem:
  //    - id:     usado internamente (sem espacos)
  //    - nome:   aparece na tela
  //    - senha:  login simples para o musico entrar (pode repetir se quiser)
  //    - aux:    qual saida aux (0..9) e o fone DELE
  //    - canais: lista de canais que ele pode controlar no fone dele (sem
  //              limite fixo). Cada canal tem o indice na mesa (id) e um
  //              nome amigavel.
  //
  //  IMPORTANTE: os indices de canal comecam em 0.
  //    Canal 1 da mesa = id 0, Canal 2 = id 1, ... Canal 24 = id 23.
  // --------------------------------------------------------------------------
  musicos: [
    {
      id: 'baterista',
      nome: 'Baterista',
      senha: '1111',
      aux: 8, // fone BATERISTA (estereo 8+9 -> usa o indice da esquerda: 8)
      auxParceiro: 9, // outro lado do par estereo (so' para mostrar na tela de login)
      canais: canaisTodos,
    },
    {
      id: 'guivio',
      nome: 'Guitarra / Baixo',
      senha: '2222',
      aux: 5, // fone GUI/VIO (estereo 5+6 -> usa 5)
      auxParceiro: 6,
      canais: canaisTodos,
    },
    {
      id: 'teclado',
      nome: 'Teclado',
      senha: '3333',
      aux: 2, // fone TECLADO (estereo 2+3 -> usa 2)
      auxParceiro: 3,
      canais: canaisTodos,
    },
    {
      id: 'teclado2',
      nome: 'Tec/Vio',
      senha: '4444',
      aux: 4, // fone TECLADO 2 (mono, sem parceiro)
      canais: canaisTodos,
    },
  ],

  // --------------------------------------------------------------------------
  //  MUTE GERAL (aba "GERAL") — botoes que mutam o canal por INTEIRO: em
  //  TODOS os fones + no som principal (PA) da igreja. Diferente do mute
  //  normal (que so tira do fone de UM musico). TODOS os musicos veem e
  //  podem usar esses 5, independente do instrumento que cada um toca —
  //  serve para o musico se tirar sozinho quando nao esta tocando, sem
  //  precisar chamar o operador da mesa.
  //
  //  ATENCAO: a numeracao "Teclado 1/2" aqui e' por INSTRUMENTO (Teclado 1 =
  //  o teclado estereo, Teclado 2 = o segundo teclado, mono) e NAO bate com
  //  os nomes "Teclado 1/2/3" da lista de canais acima (que numeram por
  //  CANAL da mesa). Teclado 1 (aqui) = CH10+11. Teclado 2 (aqui) = CH12.
  // --------------------------------------------------------------------------
  muteGeral: [
    { id: 0,  nome: 'Guitarra' },
    { id: 1,  nome: 'Baixo' },
    { id: 17, nome: 'Violao' },                  // canal "CORINGA" na mesa
    { id: 9,  nome: 'Teclado 1', parceiro: 10 }, // estereo (CH10+11)
    { id: 11, nome: 'Teclado 2' },               // CH12, mono
  ],

  // --------------------------------------------------------------------------
  //  SENHA DA HOUSE MIX (tela de monitor / operador)
  // --------------------------------------------------------------------------
  houseMix: {
    senha: 'housemix',
  },
};

// Helper: encontra um musico pelo id
export function acharMusico(id) {
  return config.musicos.find((m) => m.id === id) || null;
}
