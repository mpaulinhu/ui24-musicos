/**
 * Nivel do envio individual, depois do fader do envio e antes do master do aux.
 * O VU2 usa uma escala logaritmica: multiplicar pelo percentual do fader nao
 * corresponde ao nivel de audio. Curva conferida em modVu/VtoLIN da interface
 * oficial servida pela Ui24R (mixer.html).
 */
export function aplicarFaderAoMedidor(nivel, fader) {
  if (!Number.isFinite(nivel) || !Number.isFinite(fader) || nivel < 0.001 || fader < 0.001) return 0;
  const v = Math.max(0, Math.min(1, fader));
  const logGanho = -8.22581937262139
    + v * (23.90844819639692 + v * (-26.23877598214595 + v * (12.195249692570245 - 0.4878099877028098 * v)))
    + (v < 0.055 ? Math.log(Math.sin(28.559933214452666 * v)) : 0);
  return Math.max(0, Math.min(1, nivel + 0.09047801706317746 * logGanho));
}

function canalMutado(estado, chave, incluiVca = true) {
  if (Number(estado.get(`${chave}.forceunmute`)) === 1) return false;
  const gruposAtivos = Number(estado.get('mgmask')) | 0;
  const gruposCanal = Number(estado.get(`${chave}.mgmask`)) | 0;
  if (Number(estado.get(`${chave}.mute`)) === 1
    || (gruposAtivos & gruposCanal) !== 0 || (gruposAtivos & (1 << 23)) !== 0) return true;
  const vca = estado.get(`${chave}.vca`);
  return incluiVca && vca != null && Number.isInteger(Number(vca)) && Number(vca) >= 0
    ? canalMutado(estado, `v.${Number(vca)}`, false) : false;
}

export function nivelEnviadoAoAux(dados, estado, canal, aux) {
  const tipo = canal.tipo || 'i';
  const indice = canal.canalMesa ?? canal.id;
  const chave = `${tipo}.${indice}`;
  const envio = `${chave}.aux.${aux}`;
  if (Number(estado.get(`${envio}.mute`)) === 1) return 0;

  const post = Number(estado.get(`${envio}.post`)) === 1;
  const muteVinculado = Number(estado.get('settings.auxmutelink')) === 1 || post;
  if (muteVinculado && canalMutado(estado, chave)) return 0;

  const grupo = tipo === 'l' ? 'line' : 'input';
  const preProcessamento = estado.get(`${envio}.postproc`) != null
    && Number(estado.get(`${envio}.postproc`)) === 0;
  const fonte = post ? dados.posFader?.[grupo]
    : preProcessamento ? dados.pre?.[grupo] : dados[grupo];
  // Sem estado do envio, aguardamos a mesa em vez de exibir o sinal de entrada.
  const fader = estado.get(`${envio}.value`);
  if (fader == null) return 0;
  return aplicarFaderAoMedidor(fonte?.[indice], Number(fader));
}
