// Compartilhado pelas telas de musico e House Mix.
window.ChatDigitando = class {
  constructor(input, status, enviar, podeEnviar) {
    this.input = input;
    this.status = status;
    this.enviar = enviar;
    this.podeEnviar = podeEnviar;
    this.ativo = false;
    this.ultimoEnvio = 0;
    this.timer = null;
    input.addEventListener('input', () => this.digitar());
    input.addEventListener('blur', () => this.parar());
    window.addEventListener('pagehide', () => this.parar());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.parar();
    });
  }

  digitar() {
    if (!this.podeEnviar() || !this.input.value.trim()) { this.parar(); return; }
    const agora = Date.now();
    if (!this.ativo || agora - this.ultimoEnvio >= 1000) {
      this.enviar({ tipo: 'chat_digitando', ativo: true });
      this.ultimoEnvio = agora;
    }
    this.ativo = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.parar(), 2000);
  }

  parar() {
    clearTimeout(this.timer);
    if (this.ativo) this.enviar({ tipo: 'chat_digitando', ativo: false });
    this.ativo = false;
  }

  desconectar() {
    clearTimeout(this.timer);
    this.ativo = false;
    this.atualizar([]);
  }

  retomar() {
    if (document.activeElement === this.input && !document.hidden) this.digitar();
  }

  atualizar(pessoas) {
    const nomes = pessoas.map((pessoa) => pessoa.nome);
    const lista = nomes.length > 1
      ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
      : nomes[0];
    this.status.textContent = nomes.length
      ? `${lista} ${nomes.length === 1 ? 'está digitando' : 'estão digitando'}…`
      : '';
  }
};
