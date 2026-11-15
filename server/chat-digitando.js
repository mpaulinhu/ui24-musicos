// Estado passageiro, separado do historico do chat e da presenca online.
export class ChatDigitando {
  constructor(aoMudar) {
    this.aoMudar = aoMudar;
    this.ativos = new Map();
  }

  identidade(cli) {
    if (!cli.autenticado) return null;
    if (cli.tipo === 'housemix') return { id: 'housemix', nome: 'House Mix' };
    if (cli.tipo === 'musico' && cli.musico) {
      return { id: `musico:${cli.musico.id}`, nome: cli.nome };
    }
    return null;
  }

  atualizar(cli, ativo) {
    const pessoa = this.identidade(cli);
    if (!pessoa) return;
    if (ativo !== true) { this.parar(cli); return; }
    const anterior = this.ativos.get(cli);
    if (anterior) clearTimeout(anterior.timer);
    const timer = setTimeout(() => this.parar(cli), 5000);
    timer.unref?.();
    this.ativos.set(cli, { ...pessoa, timer });
    if (!anterior || anterior.id !== pessoa.id || anterior.nome !== pessoa.nome) this.aoMudar();
  }

  parar(cli) {
    const anterior = this.ativos.get(cli);
    if (!anterior) return;
    clearTimeout(anterior.timer);
    this.ativos.delete(cli);
    this.aoMudar();
  }

  pessoasPara(cli) {
    const propria = this.identidade(cli)?.id;
    const pessoas = new Map();
    for (const { id, nome } of this.ativos.values()) {
      if (id !== propria) pessoas.set(id, { id, nome });
    }
    return [...pessoas.values()];
  }
}
