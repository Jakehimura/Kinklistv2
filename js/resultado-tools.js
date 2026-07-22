/**
 * resultado-tools.js
 * -------------------
 * Funcionalidades da tela de resultados:
 * 1. Codificar/decodificar o resultado dentro de um link (sem backend), de forma compacta.
 * 2. Comparar dois perfis (o atual + um colado via link) e calcular compatibilidade,
 *    geral e por categoria.
 * 3. Exportar a tela de resultados como PDF.
 * 4. Salvar/retomar progresso automaticamente no localStorage.
 * 5. Gráfico de teia (radar) por categoria.
 *
 * PARA MANTER O LINK CURTO:
 * - O pacote NÃO carrega texto de pergunta nem nome de categoria — só ids curtos
 *   (ex: "bondage-restricao-geral" + índice da pergunta). Quem abre o link já tem
 *   os mesmos data/categorias.json e data/perguntas.json carregados, então o texto
 *   é resolvido localmente a partir do id.
 * - Cada resposta vira uma string curta ('L' = limite rígido, 'N' = nunca
 *   experimentei, '0'-'6' = posição na escala) em vez de um objeto.
 * - O JSON resultante é comprimido com LZString antes de entrar na URL.
 * - Por cima disso tudo, o link ainda é encurtado via is.gd.
 */

// ---------- CODIFICAÇÃO COMPACTA ----------

function codificarEstadoLinha(rs) {
  if (rs.limite) return 'L';
  if (rs.nunca) return 'N';
  if (rs.valor !== null) return String(rs.valor);
  return null;
}

function decodificarEstadoLinha(cod) {
  if (cod === undefined || cod === null) return { limite: false, nunca: false, valor: null };
  if (cod === 'L') return { limite: true, nunca: false, valor: null };
  if (cod === 'N') return { limite: false, nunca: true, valor: null };
  return { limite: false, nunca: false, valor: Number(cod) };
}

function montarPacoteResultado() {
  const r = [];

  categoriasQuestionario.forEach(cat => {
    cat.perguntas.forEach(p => {
      const estado = respostasUsuario[p.id];
      const idx = Number(p.id.split('#')[1]);
      const entry = { c: cat.id, i: idx, m: estado.modo[0] }; // m: 'f' | 'r' | 'a'

      if (estado.modo === 'fazer' || estado.modo === 'ambos') {
        const cod = codificarEstadoLinha(estado.fazer);
        if (cod) entry.f = cod;
      }
      if (estado.modo === 'receber' || estado.modo === 'ambos') {
        const cod = codificarEstadoLinha(estado.receber);
        if (cod) entry.d = cod; // 'd' pra não colidir com o 'r' do modo
      }

      if (entry.f || entry.d) r.push(entry);
    });
  });

  return { v: 2, perfil: respostasPerfil, r };
}

function codificarPacote(pacote) {
  const json = JSON.stringify(pacote);
  return LZString.compressToEncodedURIComponent(json);
}

function decodificarPacote(token) {
  const json = LZString.decompressFromEncodedURIComponent(token);
  if (!json) throw new Error('Token inválido ou corrompido');
  return JSON.parse(json);
}

function expandirPacote(pacote) {
  const catMap = {};
  const respostas = {};

  pacote.r.forEach(entry => {
    const catInfo = dataManager.categorias.find(c => c.id === entry.c);
    const catNome = catInfo ? catInfo.nome : entry.c;
    const texto = (dataManager.perguntas[entry.c] || [])[entry.i] || `Pergunta ${entry.i + 1}`;
    const id = entry.c + '#' + entry.i;
    const modoFull = entry.m === 'f' ? 'fazer' : entry.m === 'r' ? 'receber' : 'ambos';

    if (!catMap[entry.c]) catMap[entry.c] = { id: entry.c, nome: catNome, perguntas: [] };
    catMap[entry.c].perguntas.push({ id, texto });

    respostas[id] = {
      modo: modoFull,
      fazer: decodificarEstadoLinha(entry.f),
      receber: decodificarEstadoLinha(entry.d)
    };
  });

  return { perfil: pacote.perfil, categorias: Object.values(catMap), respostas };
}

// ---------- LINK DE COMPARTILHAMENTO ----------

function gerarLinkCompartilhamento() {
  const token = codificarPacote(montarPacoteResultado());
  return `${location.origin}${location.pathname}#ver=${token}`;
}

// Adiciona um limite de tempo a uma Promise: se ela não resolver/rejeitar
// dentro do prazo, rejeita sozinha. Evita que uma chamada travada (script que
// nunca carrega nem dá erro, comum com bloqueadores de anúncio) prenda a
// interface pra sempre.
function comTimeout(promise, ms, mensagemErro) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensagemErro)), ms))
  ]);
}

// Encurta a URL usando is.gd (gratuito, sem cadastro, feito pra ser chamado direto
// do navegador — usamos JSONP pra não depender de CORS).
function encurtarLinkBruto(urlLonga) {
  return new Promise((resolve, reject) => {
    const callbackName = 'isgdCallback_' + Date.now();
    const script = document.createElement('script');

    const limpar = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (data) => {
      limpar();
      if (data && data.shorturl) resolve(data.shorturl);
      else reject(new Error((data && data.errormessage) || 'Erro ao encurtar o link'));
    };

    script.onerror = () => {
      limpar();
      reject(new Error('Falha ao contatar o encurtador'));
    };

    script.src = `https://is.gd/create.php?format=json&callback=${callbackName}&url=${encodeURIComponent(urlLonga)}`;
    document.body.appendChild(script);
  });
}

function encurtarLink(urlLonga) {
  return comTimeout(encurtarLinkBruto(urlLonga), 6000, 'Tempo esgotado ao tentar encurtar o link');
}

// Faz o caminho inverso: dado um link curto (is.gd/xxxxx ou v.gd/xxxxx), resolve
// pra URL completa original. Necessário porque quem cola um link no comparador
// normalmente vai colar a versão curta, não a longa com o token dentro.
// Se o texto passado não parecer um link curto, devolve ele mesmo sem alterar.
function resolverLinkCurtoBruto(urlOuTexto) {
  return new Promise((resolve, reject) => {
    const match = urlOuTexto.match(/(?:is\.gd|v\.gd)\/([a-zA-Z0-9]+)/);
    if (!match) { resolve(urlOuTexto); return; }

    const codigo = match[1];
    const callbackName = 'isgdLookup_' + Date.now();
    const script = document.createElement('script');

    const limpar = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (data) => {
      limpar();
      if (data && data.url) resolve(data.url);
      else reject(new Error((data && data.errormessage) || 'Não consegui resolver o link curto'));
    };

    script.onerror = () => {
      limpar();
      reject(new Error('Falha ao contatar o encurtador'));
    };

    script.src = `https://is.gd/forward.php?format=json&callback=${callbackName}&shorturl=${codigo}`;
    document.body.appendChild(script);
  });
}

function resolverLinkCurto(urlOuTexto) {
  return comTimeout(resolverLinkCurtoBruto(urlOuTexto), 6000, 'Tempo esgotado ao resolver o link curto');
}

async function copiarLinkCompartilhamento() {
  let urlLonga;
  try {
    urlLonga = gerarLinkCompartilhamento();
  } catch (e) {
    console.error('Erro ao montar o link:', e);
    return { ok: false, url: null, encurtado: false, erro: 'Não consegui montar o link. Veja o console pra detalhes.' };
  }

  let urlFinal = urlLonga;
  let encurtado = true;

  try {
    urlFinal = await encurtarLink(urlLonga);
  } catch (e) {
    console.warn('Encurtador indisponível, usando link completo:', e);
    encurtado = false;
  }

  try {
    await navigator.clipboard.writeText(urlFinal);
    return { ok: true, url: urlFinal, encurtado };
  } catch (e) {
    console.warn('Não foi possível copiar automaticamente:', e);
    return { ok: false, url: urlFinal, encurtado };
  }
}

// Ao abrir o app com #ver=<token> na URL, mostra o perfil compartilhado (somente leitura)
function verificarLinkCompartilhado() {
  const hash = location.hash;
  if (!hash.startsWith('#ver=')) return false;

  const token = hash.slice(5);
  try {
    const pacote = decodificarPacote(token);
    renderPerfilCompartilhado(expandirPacote(pacote));
    return true;
  } catch (e) {
    console.error('Link de compartilhamento inválido:', e);
    return false;
  }
}

// ---------- PROGRESSO SALVO LOCALMENTE (retomar de onde parou) ----------

const CHAVE_PROGRESSO_LOCAL = 'kinklist_v2_progresso';

function salvarProgressoLocal(etapa) {
  try {
    const dado = {
      v: 1,
      etapa,
      respostasPerfil,
      categoriasSelecionadas,
      indiceCategoria,
      respostasUsuario
    };
    localStorage.setItem(CHAVE_PROGRESSO_LOCAL, JSON.stringify(dado));
  } catch (e) {
    console.warn('Não foi possível salvar o progresso localmente:', e);
  }
}

function carregarProgressoLocal() {
  try {
    const raw = localStorage.getItem(CHAVE_PROGRESSO_LOCAL);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function limparProgressoLocal() {
  try {
    localStorage.removeItem(CHAVE_PROGRESSO_LOCAL);
  } catch (e) {
    // sem problema, só não limpa
  }
}

// ---------- COMPATIBILIDADE ENTRE DOIS PERFIS ----------
// Ambos os parâmetros no formato { categorias, respostas } (mesmo shape usado
// para o estado atual e para um pacote expandido via expandirPacote).

function compararPerfis(perfilA, perfilB) {
  const textoPorId = {};
  const categoriaPorId = {};
  const idsA = new Set();
  const idsB = new Set();

  perfilA.categorias.forEach(c => c.perguntas.forEach(p => {
    idsA.add(p.id);
    textoPorId[p.id] = p.texto;
    categoriaPorId[p.id] = c.nome;
  }));
  perfilB.categorias.forEach(c => c.perguntas.forEach(p => {
    idsB.add(p.id);
    if (!textoPorId[p.id]) textoPorId[p.id] = p.texto;
    if (!categoriaPorId[p.id]) categoriaPorId[p.id] = c.nome;
  }));

  const idsComuns = [...idsA].filter(id => idsB.has(id));

  const resultado = { perfect: [], good: [], potential: [], conflicts: [] };
  const somaPorCategoria = {}; // nome -> { soma, contagem }
  let scoreSum = 0;
  let scoreCount = 0;

  function avaliarPar(id, texto, dar, receber) {
    if (!dar || !receber) return;
    if (dar.limite || receber.limite) {
      resultado.conflicts.push({ texto, motivo: 'Um dos lados marcou como limite rígido' });
      return;
    }
    if (dar.nunca || receber.nunca || dar.valor === null || receber.valor === null) return;

    const media = (dar.valor + receber.valor) / 2;
    scoreSum += media;
    scoreCount++;

    const cat = categoriaPorId[id];
    if (!somaPorCategoria[cat]) somaPorCategoria[cat] = { soma: 0, contagem: 0 };
    somaPorCategoria[cat].soma += media;
    somaPorCategoria[cat].contagem++;

    if (media >= 5) resultado.perfect.push({ texto });
    else if (media >= 3) resultado.good.push({ texto });
    else if (media >= 1) resultado.potential.push({ texto });
  }

  idsComuns.forEach(id => {
    const a = perfilA.respostas[id];
    const b = perfilB.respostas[id];
    const texto = textoPorId[id];
    avaliarPar(id, texto, a.fazer, b.receber);
    avaliarPar(id, texto, b.fazer, a.receber);
  });

  const scoreGeral = scoreCount > 0 ? Math.round((scoreSum / scoreCount) / 6 * 100) : 0;
  const scorePorCategoria = Object.entries(somaPorCategoria)
    .map(([nome, v]) => ({ nome, score: Math.round((v.soma / v.contagem) / 6 * 100) }))
    .sort((a, b) => b.score - a.score);

  return { scoreGeral, scorePorCategoria, ...resultado, totalComparado: idsComuns.length };
}

// ---------- GRÁFICO DE TEIA (RADAR) POR CATEGORIA ----------
// Calcula, pra cada categoria, a intensidade média das respostas (0-100%),
// considerando só respostas com valor de escala — Limite Rígido e Nunca
// Experimentei ficam de fora da média (senão distorceriam pra baixo à toa).

function calcularMediasPorCategoria(categorias, respostas) {
  return categorias.map(cat => {
    let soma = 0;
    let contagem = 0;

    cat.perguntas.forEach(p => {
      const estado = respostas[p.id];
      if (!estado) return;
      ['fazer', 'receber'].forEach(chave => {
        if (estado.modo !== chave && estado.modo !== 'ambos') return;
        const rs = estado[chave];
        if (rs && rs.valor !== null) {
          soma += rs.valor;
          contagem++;
        }
      });
    });

    return { label: cat.nome, valor: contagem > 0 ? Math.round((soma / contagem) / 6 * 100) : 0 };
  });
}

function construirSvgRadar(pontos, tamanho) {
  tamanho = tamanho || 280;
  const n = pontos.length;
  if (n < 3) return '<p class="subtitle">Responda pelo menos 3 tópicos pra ver o gráfico.</p>';

  const centro = tamanho / 2;
  const raio = tamanho / 2 - 44;

  function coordenada(i, escala) {
    const angulo = (Math.PI * 2 * i / n) - Math.PI / 2;
    const r = raio * escala;
    return [centro + r * Math.cos(angulo), centro + r * Math.sin(angulo)];
  }

  let grade = '';
  [0.25, 0.5, 0.75, 1].forEach(escala => {
    const path = pontos.map((_, i) => coordenada(i, escala).join(',')).join(' ');
    grade += `<polygon points="${path}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
  });

  let eixos = '';
  pontos.forEach((_, i) => {
    const [x, y] = coordenada(i, 1);
    eixos += `<line x1="${centro}" y1="${centro}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
  });

  const areaPath = pontos.map((p, i) => coordenada(i, p.valor / 100).join(',')).join(' ');

  let labels = '';
  pontos.forEach((p, i) => {
    const [x, y] = coordenada(i, 1.2);
    labels += `<text x="${x}" y="${y}" font-size="9" fill="var(--text-secondary)" text-anchor="middle" dominant-baseline="middle">${p.label}</text>`;
  });

  return `
    <svg viewBox="0 0 ${tamanho} ${tamanho}" width="100%" style="max-width:${tamanho}px; display:block; margin:0 auto;">
      ${grade}
      ${eixos}
      <polygon points="${areaPath}" fill="var(--accent)" fill-opacity="0.28" stroke="var(--accent)" stroke-width="2"/>
      ${labels}
    </svg>
  `;
}

function renderGraficoRadarHtml(categorias, respostas) {
  const pontos = calcularMediasPorCategoria(categorias, respostas);
  return construirSvgRadar(pontos);
}

// ---------- EXPORTAR PDF ----------

async function exportarResultadoPDF() {
  const elemento = document.querySelector('.resultado-card');
  if (!elemento || typeof html2canvas === 'undefined' || !window.jspdf) {
    alert('Não foi possível gerar o PDF. Tente novamente em alguns segundos.');
    return;
  }

  const canvas = await html2canvas(elemento, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const largura = 210;
  const alturaTotal = (canvas.height * largura) / canvas.width;
  const alturaPagina = 297;

  if (alturaTotal <= alturaPagina) {
    pdf.addImage(imgData, 'PNG', 0, 0, largura, alturaTotal);
  } else {
    // Conteúdo maior que uma página A4: divide em várias páginas fatiando o canvas.
    let alturaRestante = canvas.height;
    let posicaoOrigem = 0;
    const alturaFatiaPx = Math.floor((alturaPagina * canvas.width) / largura);

    let primeira = true;
    while (alturaRestante > 0) {
      const alturaFatia = Math.min(alturaFatiaPx, alturaRestante);

      const canvasFatia = document.createElement('canvas');
      canvasFatia.width = canvas.width;
      canvasFatia.height = alturaFatia;
      const ctx = canvasFatia.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasFatia.width, canvasFatia.height);
      ctx.drawImage(canvas, 0, posicaoOrigem, canvas.width, alturaFatia, 0, 0, canvas.width, alturaFatia);

      const imgFatia = canvasFatia.toDataURL('image/png');
      const alturaFatiaMm = (alturaFatia * largura) / canvas.width;

      if (!primeira) pdf.addPage();
      pdf.addImage(imgFatia, 'PNG', 0, 0, largura, alturaFatiaMm);

      posicaoOrigem += alturaFatia;
      alturaRestante -= alturaFatia;
      primeira = false;
    }
  }

  pdf.save('meus-resultados.pdf');
}
