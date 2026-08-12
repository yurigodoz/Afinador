/**
 * Regras de quando convidar o usuário a instalar o app.
 *
 * Módulo puro: recebe o que já foi apurado sobre o ambiente e decide. Quem olha
 * `navigator` e `localStorage` é o hook.
 *
 * O convite é a parte fácil de fazer e a fácil de fazer mal. Um banner que
 * reaparece a cada visita vira ruído, e ruído numa ferramenta que se usa por 30
 * segundos é pior que a ausência do recurso.
 */

export const CHAVE_DISPENSA = 'afinador:convite-dispensado-em';

/** Depois de dispensado, só volta a perguntar daqui a uma semana. */
export const DIAS_ATE_PERGUNTAR_DE_NOVO = 7;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * iOS não expõe `beforeinstallprompt` — nenhum navegador, porque todos usam o
 * WebKit do sistema. Instalar lá é manual, pelo menu de compartilhamento, então
 * o que resta é explicar o caminho.
 */
export function pareceIOS(userAgent) {
  if (!userAgent) return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS recente se identifica como Mac; o toque é o que o denuncia — mas
  // isso quem checa é o chamador, que tem acesso ao `navigator`.
  return false;
}

/**
 * @param {object} contexto
 * @param {boolean} contexto.instalado        já roda como app instalado
 * @param {boolean} contexto.temPromptNativo  o navegador ofereceu o prompt
 * @param {boolean} contexto.ios              precisa de instrução manual
 * @param {number|null} contexto.dispensadoEm timestamp da última dispensa
 * @param {number} contexto.agora
 */
export function deveConvidar({
  instalado,
  temPromptNativo,
  ios,
  dispensadoEm = null,
  agora = Date.now(),
}) {
  if (instalado) return false;

  // Sem prompt nativo e sem ser iOS, não há o que oferecer: ou o navegador não
  // suporta instalação, ou já considera o app instalado.
  if (!temPromptNativo && !ios) return false;

  if (dispensadoEm && agora - dispensadoEm < DIAS_ATE_PERGUNTAR_DE_NOVO * UM_DIA_MS) {
    return false;
  }

  return true;
}

/** Lê o timestamp guardado, tolerando lixo. */
export function lerDispensa(bruto) {
  const valor = Number(bruto);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}
