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

export const config = {
  // --------------------------------------------------------------------------
  //  CONEXAO COM A MESA
  // --------------------------------------------------------------------------
  //  IP e porta da Ui24R na rede da igreja.
  //  - Para testar em casa com o SIMULADOR, use: host '127.0.0.1', porta 8001
  //  - Na igreja, troque para o IP real da mesa e porta 80.
  mesa: {
    host: '127.0.0.1', // <-- TROCAR pelo IP da mesa na igreja (ex: '192.168.1.100')
    port: 8001,        // <-- Na igreja normalmente e 80
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
  //    - canais: lista de ate 20 canais que ele pode controlar no fone dele.
  //              Cada canal tem o indice na mesa (id) e um nome amigavel.
  //
  //  IMPORTANTE: os indices de canal comecam em 0.
  //    Canal 1 da mesa = id 0, Canal 2 = id 1, ... Canal 24 = id 23.
  // --------------------------------------------------------------------------
  musicos: [
    {
      id: 'baterista',
      nome: 'Baterista',
      senha: '1111',
      aux: 0, // fone/aux do baterista
      canais: [
        { id: 0,  nome: 'Bumbo' },
        { id: 1,  nome: 'Caixa' },
        { id: 2,  nome: 'Tom 1' },
        { id: 3,  nome: 'Tom 2' },
        { id: 4,  nome: 'Overhead' },
        { id: 5,  nome: 'Baixo' },
        { id: 6,  nome: 'Guitarra' },
        { id: 7,  nome: 'Violao' },
        { id: 8,  nome: 'Teclado L' },
        { id: 9,  nome: 'Teclado R' },
        { id: 10, nome: 'Voz Principal' },
        { id: 11, nome: 'Back Vocal 1' },
        { id: 12, nome: 'Back Vocal 2' },
        { id: 13, nome: 'Back Vocal 3' },
        { id: 14, nome: 'Click' },
        { id: 15, nome: 'Playback L' },
        { id: 16, nome: 'Playback R' },
        { id: 17, nome: 'Ministracao' },
        { id: 18, nome: 'Ambiente' },
        { id: 19, nome: 'Extra' },
      ],
    },
    {
      id: 'baixista',
      nome: 'Baixista',
      senha: '2222',
      aux: 1,
      canais: [
        { id: 0,  nome: 'Bumbo' },
        { id: 1,  nome: 'Caixa' },
        { id: 4,  nome: 'Overhead' },
        { id: 5,  nome: 'Baixo' },
        { id: 6,  nome: 'Guitarra' },
        { id: 7,  nome: 'Violao' },
        { id: 8,  nome: 'Teclado L' },
        { id: 9,  nome: 'Teclado R' },
        { id: 10, nome: 'Voz Principal' },
        { id: 11, nome: 'Back Vocal 1' },
        { id: 12, nome: 'Back Vocal 2' },
        { id: 13, nome: 'Back Vocal 3' },
        { id: 14, nome: 'Click' },
        { id: 15, nome: 'Playback L' },
        { id: 16, nome: 'Playback R' },
        { id: 17, nome: 'Ministracao' },
        { id: 18, nome: 'Ambiente' },
        { id: 19, nome: 'Extra' },
      ],
    },
    {
      id: 'guitarrista',
      nome: 'Guitarrista',
      senha: '3333',
      aux: 2,
      canais: [
        { id: 0,  nome: 'Bumbo' },
        { id: 1,  nome: 'Caixa' },
        { id: 5,  nome: 'Baixo' },
        { id: 6,  nome: 'Guitarra' },
        { id: 7,  nome: 'Violao' },
        { id: 8,  nome: 'Teclado L' },
        { id: 9,  nome: 'Teclado R' },
        { id: 10, nome: 'Voz Principal' },
        { id: 11, nome: 'Back Vocal 1' },
        { id: 12, nome: 'Back Vocal 2' },
        { id: 13, nome: 'Back Vocal 3' },
        { id: 14, nome: 'Click' },
        { id: 17, nome: 'Ministracao' },
        { id: 18, nome: 'Ambiente' },
      ],
    },
    {
      id: 'tecladista',
      nome: 'Tecladista',
      senha: '4444',
      aux: 3,
      canais: [
        { id: 0,  nome: 'Bumbo' },
        { id: 1,  nome: 'Caixa' },
        { id: 5,  nome: 'Baixo' },
        { id: 6,  nome: 'Guitarra' },
        { id: 7,  nome: 'Violao' },
        { id: 8,  nome: 'Teclado L' },
        { id: 9,  nome: 'Teclado R' },
        { id: 10, nome: 'Voz Principal' },
        { id: 11, nome: 'Back Vocal 1' },
        { id: 12, nome: 'Back Vocal 2' },
        { id: 13, nome: 'Back Vocal 3' },
        { id: 14, nome: 'Click' },
        { id: 17, nome: 'Ministracao' },
        { id: 18, nome: 'Ambiente' },
      ],
    },
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
