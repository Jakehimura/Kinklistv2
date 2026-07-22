const app = document.getElementById('app');

// ---------- TEMA (claro/escuro) ----------

function temaInicial() {
  const salvo = localStorage.getItem('kinklist_v2_tema');
  if (salvo) return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function aplicarTema(tema) {
  document.body.classList.toggle('dark', tema === 'dark');
  localStorage.setItem('kinklist_v2_tema', tema);
  const btn = document.getElementById('toggle-tema');
  if (btn) btn.textContent = tema === 'dark' ? '☀️' : '🌙';
}

(function initTema() {
  aplicarTema(temaInicial());
  const btn = document.getElementById('toggle-tema');
  if (btn) {
    btn.addEventListener('click', () => {
      const atual = document.body.classList.contains('dark') ? 'dark' : 'light';
      aplicarTema(atual === 'dark' ? 'light' : 'dark');
    });
  }
})();

const ESCALA_CORES = ['#BA7517', '#EF9F27', '#FAC775', '#C9C9D2', '#97C459', '#639922', '#3B6D11'];
const ESCALA_TAMANHOS = [26, 22, 18, 14, 18, 22, 26];

let categoriasDisponiveis = [];   // categorias após o ruleEngine (hoje = todas)
let categoriasSelecionadas = [];  // ids escolhidos pelo usuário na tela de seleção
let categoriasQuestionario = [];  // [{ id, nome, perguntas: [{ id, texto }] }] na ordem do questionário
let indiceCategoria = 0;

let respostasPerfil = { quemVoceE: {}, tipoRelacionamento: [], locais: [] };
let respostasUsuario = {};

function estadoLinhaVazio() {
  return { limite: false, nunca: false, valor: null };
}
function estadoPerguntaVazio() {
  return { modo: 'ambos', fazer: estadoLinhaVazio(), receber: estadoLinhaVazio() };
}

function linhaRespondida(rs) {
  return rs.limite || rs.nunca || rs.valor !== null;
}

function perguntaRespondida(perguntaId) {
  const estado = respostasUsuario[perguntaId];
  if (estado.modo === 'fazer') return linhaRespondida(estado.fazer);
  if (estado.modo === 'receber') return linhaRespondida(estado.receber);
  return linhaRespondida(estado.fazer) && linhaRespondida(estado.receber);
}

function categoriaCompleta(categoria) {
  return categoria.perguntas.every(p => perguntaRespondida(p.id));
}

// ---------- PERFIL: "Quem é você?" (selects) ----------

function renderPerfilCompleto() {
  const secaoQuem = dataManager.perfil.quemVoceE;
  const respostasQuem = respostasPerfil.quemVoceE;
  const secaoRelacionamento = dataManager.perfil.tipoRelacionamento;
  const secaoLocais = dataManager.perfil.locais;

  const ruleEngine = new RuleEngine(dataManager.perfil.regrasCondicionais);
  categoriasDisponiveis = ruleEngine.categoriasAplicaveis(dataManager.categorias, respostasPerfil);

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 15%"></div></div>

    <div class="card secao-card">
      <h2 class="secao-titulo">👤 ${secaoQuem.titulo}</h2>
      <div class="campos-select">
        ${secaoQuem.campos.map(campo => `
          <label class="campo-select">
            <span>${campo.label}</span>
            <select data-campo="${campo.id}">
              ${campo.opcoes.map(o => `<option value="${o}" ${respostasQuem[campo.id] === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </label>
        `).join('')}
      </div>
    </div>

    <div class="card secao-card">
      <h2 class="secao-titulo">💞 ${secaoRelacionamento.titulo}</h2>
      ${secaoRelacionamento.subtitulo ? `<p class="subtitle">${secaoRelacionamento.subtitulo}</p>` : ''}
      <div class="chips-grupo chips-categorias">
        ${secaoRelacionamento.opcoes.map(o => `
          <button class="chip ${respostasPerfil.tipoRelacionamento.includes(o) ? 'selected' : ''}" data-grupo="tipoRelacionamento" data-valor="${o}">${o}</button>
        `).join('')}
      </div>
    </div>

    <div class="card secao-card">
      <h2 class="secao-titulo">📍 ${secaoLocais.titulo}</h2>
      ${secaoLocais.subtitulo ? `<p class="subtitle">${secaoLocais.subtitulo}</p>` : ''}
      <div class="chips-grupo chips-categorias">
        ${secaoLocais.opcoes.map(o => `
          <button class="chip ${respostasPerfil.locais.includes(o) ? 'selected' : ''}" data-grupo="locais" data-valor="${o}">${o}</button>
        `).join('')}
      </div>
    </div>

    <div class="card secao-card">
      <h2 class="secao-titulo">📋 Subcategorias</h2>
      <p class="subtitle">Selecione os tópicos que você quer responder.</p>
      <div class="chips-grupo chips-categorias">
        ${categoriasDisponiveis.map(cat => `
          <button class="chip ${categoriasSelecionadas.includes(cat.id) ? 'selected' : ''}" data-grupo="categorias" data-valor="${cat.id}">${cat.nome}</button>
        `).join('')}
      </div>
    </div>

    <button class="btn-primary btn-iniciar-full" id="btn-iniciar" ${categoriasSelecionadas.length === 0 ? 'disabled' : ''}>🚀 Iniciar Questionário</button>
  `;

  app.querySelectorAll('select[data-campo]').forEach(sel => {
    respostasQuem[sel.dataset.campo] = sel.value;
    sel.addEventListener('change', () => {
      respostasQuem[sel.dataset.campo] = sel.value;
      salvarProgressoLocal('perfil');
    });
  });

  const btnIniciar = document.getElementById('btn-iniciar');

  app.querySelectorAll('.chip[data-grupo]').forEach(chip => {
    chip.addEventListener('click', () => {
      const grupo = chip.dataset.grupo;
      const valor = chip.dataset.valor;
      const lista = grupo === 'categorias' ? categoriasSelecionadas : respostasPerfil[grupo];

      const idx = lista.indexOf(valor);
      if (idx === -1) lista.push(valor); else lista.splice(idx, 1);
      chip.classList.toggle('selected');

      if (grupo === 'categorias') btnIniciar.disabled = categoriasSelecionadas.length === 0;
      salvarProgressoLocal('perfil');
    });
  });

  btnIniciar.addEventListener('click', iniciarQuestionario);
  salvarProgressoLocal('perfil');
}

// ---------- MONTAGEM DO QUESTIONÁRIO (agrupado por categoria) ----------

function montarCategoriasQuestionario() {
  categoriasQuestionario = categoriasDisponiveis
    .filter(cat => categoriasSelecionadas.includes(cat.id))
    .map(cat => {
      const perguntas = (dataManager.perguntas[cat.id] || []).map((texto, idx) => {
        const id = cat.id + '#' + idx;
        if (!respostasUsuario[id]) respostasUsuario[id] = estadoPerguntaVazio();
        return { id, texto };
      });
      return { id: cat.id, nome: cat.nome, perguntas };
    });
}

function iniciarQuestionario() {
  montarCategoriasQuestionario();
  indiceCategoria = 0;
  renderCategoria();
  salvarProgressoLocal('questionario');
}

// ---------- TELA DE CATEGORIA (todas as perguntas daquele tópico juntas) ----------

function renderCategoria() {
  const categoria = categoriasQuestionario[indiceCategoria];
  const progresso = 25 + Math.round(((indiceCategoria + 1) / categoriasQuestionario.length) * 75);

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: ${progresso}%"></div></div>
    <div class="card categoria-card">
      <div class="categoria-header">
        <div class="categoria-eyebrow">Tópico ${indiceCategoria + 1} de ${categoriasQuestionario.length}</div>
        <h1>${categoria.nome}</h1>
      </div>

      <div id="perguntas-categoria"></div>

      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-voltar">Voltar</button>
        <button class="btn-primary" id="btn-proximo" disabled>
          ${indiceCategoria === categoriasQuestionario.length - 1 ? 'Ver resultado' : 'Próximo tópico'}
        </button>
      </div>
    </div>
  `;

  const container = document.getElementById('perguntas-categoria');
  categoria.perguntas.forEach(p => container.appendChild(criarBlocoPergunta(p.id, p.texto)));

  atualizarBotaoAvancar(categoria);

  document.getElementById('btn-voltar').addEventListener('click', () => {
    if (indiceCategoria > 0) {
      indiceCategoria--;
      renderCategoria();
    } else {
      renderPerfilCompleto();
    }
  });

  document.getElementById('btn-proximo').addEventListener('click', () => {
    if (indiceCategoria < categoriasQuestionario.length - 1) {
      indiceCategoria++;
      renderCategoria();
    } else {
      renderResultado();
    }
  });
}

function atualizarBotaoAvancar(categoria) {
  const btn = document.getElementById('btn-proximo');
  if (btn) btn.disabled = !categoriaCompleta(categoria);
  salvarProgressoLocal('questionario');
}

// ---------- RESTRIÇÃO DE "RECEBER" POR ANATOMIA ----------
// Só afeta o lado RECEBER de práticas onde receber literalmente exige ter aquela
// parte do corpo (penetração vaginal recebida, esmagamento de testículos, etc.).
// O lado FAZER nunca é restrito, porque dá pra fazer com brinquedo/strap-on/dedos
// independente da anatomia da pessoa.

const RECEBER_EXIGE_VAGINA = [
  { categoriaId: 'penetracao-basica', texto: 'Sexo Vaginal' },
  { categoriaId: 'penetracao-basica', texto: 'Fisting vaginal' },
  { categoriaId: 'penetracao-basica', texto: 'Dilatação - Vaginal' },
  { categoriaId: 'brinquedos', texto: 'Brinquedos vaginais' },
  { categoriaId: 'brinquedos', texto: 'Dupla Penetração Vaginal - Brinquedos' },
  { categoriaId: 'menage-grupal', texto: 'Dupla Penetração Vaginal' },
  { categoriaId: 'cbt-vbt', texto: 'Alargadores vaginais' }
];

const RECEBER_EXIGE_PENIS = [
  { categoriaId: 'cbt-vbt', texto: 'Esmagadores nas bolas' },
  { categoriaId: 'cbt-vbt', texto: 'Pesos nas bolas' },
  { categoriaId: 'beijos-caricias', texto: 'Anéis penianos' },
  { categoriaId: 'equip-metalicos', texto: 'Anéis penianos' }
];

function receberEstaBloqueado(categoriaId, texto) {
  const anatomia = respostasPerfil.quemVoceE.anatomia;
  if (RECEBER_EXIGE_VAGINA.some(r => r.categoriaId === categoriaId && r.texto === texto)) {
    return anatomia !== 'Vagina';
  }
  if (RECEBER_EXIGE_PENIS.some(r => r.categoriaId === categoriaId && r.texto === texto)) {
    return anatomia !== 'Pênis';
  }
  return false;
}

function criarBlocoPergunta(perguntaId, texto) {
  const estado = respostasUsuario[perguntaId];
  const categoriaId = perguntaId.split('#')[0];
  const receberBloqueado = receberEstaBloqueado(categoriaId, texto);

  const bloco = document.createElement('div');
  bloco.className = 'pergunta-bloco';

  if (receberBloqueado) {
    if (estado.modo === 'receber' || estado.modo === 'ambos') estado.modo = 'fazer';

    bloco.innerHTML = `
      <p class="pergunta-titulo">${texto}</p>
      <div class="linhas-resposta"></div>
    `;

    function renderLinhaUnica() {
      const container = bloco.querySelector('.linhas-resposta');
      container.innerHTML = '';
      container.appendChild(criarLinha(perguntaId, 'fazer', 'Fazer', renderLinhaUnica));
      atualizarBotaoAvancar(categoriasQuestionario[indiceCategoria]);
    }

    renderLinhaUnica();
    return bloco;
  }

  bloco.innerHTML = `
    <p class="pergunta-titulo">${texto}</p>
    <div class="modo-switches">
      <div class="sw-item" data-modo="fazer">
        <span class="switch"><span class="thumb"></span></span>
        <span class="sw-label">Fazer</span>
      </div>
      <div class="sw-item" data-modo="receber">
        <span class="switch"><span class="thumb"></span></span>
        <span class="sw-label">Receber</span>
      </div>
      <div class="sw-item" data-modo="ambos">
        <span class="switch"><span class="thumb"></span></span>
        <span class="sw-label">Ambos</span>
      </div>
    </div>
    <div class="linhas-resposta"></div>
  `;

  function atualizarSwitchesBloco() {
    bloco.querySelectorAll('.sw-item').forEach(item => {
      const modo = item.dataset.modo;
      const ligado = modo === 'ambos' ? estado.modo === 'ambos' : (estado.modo === modo);
      item.querySelector('.switch').classList.toggle('on', ligado);
    });
  }

  function renderLinhasBloco() {
    const container = bloco.querySelector('.linhas-resposta');
    container.innerHTML = '';
    if (estado.modo === 'fazer' || estado.modo === 'ambos') container.appendChild(criarLinha(perguntaId, 'fazer', 'Fazer', renderLinhasBloco));
    if (estado.modo === 'receber' || estado.modo === 'ambos') container.appendChild(criarLinha(perguntaId, 'receber', 'Receber', renderLinhasBloco));
    const categoria = categoriasQuestionario[indiceCategoria];
    atualizarBotaoAvancar(categoria);
  }

  bloco.querySelectorAll('.sw-item').forEach(item => {
    item.addEventListener('click', () => {
      estado.modo = item.dataset.modo;
      atualizarSwitchesBloco();
      renderLinhasBloco();
    });
  });

  atualizarSwitchesBloco();
  renderLinhasBloco();

  return bloco;
}

function criarLinha(perguntaId, chave, label, onChange) {
  const rs = respostasUsuario[perguntaId][chave];
  const wrap = document.createElement('div');
  wrap.className = 'linha-resposta';

  wrap.innerHTML = `
    <div class="linha-header">
      <span class="linha-label">${label}</span>
      <label class="check-nunca">
        <input type="checkbox" ${rs.nunca ? 'checked' : ''} />
        <span>Nunca experimentei</span>
      </label>
    </div>
    <div class="escala-row">
      <div class="limite-wrap">
        <button class="limite-btn ${rs.limite ? 'on' : 'off'}" aria-label="Limite rígido"></button>
        <span class="limite-text">Limite rígido</span>
      </div>
      <div class="divisor"></div>
      <div class="escala-grupo ${(rs.limite || rs.nunca) ? 'disabled' : ''}">
        <span class="escala-label left">Limite</span>
        ${ESCALA_TAMANHOS.map((s, i) => `
          <button class="escala-circulo ${rs.valor === i ? 'selected' : ''}"
                  data-idx="${i}"
                  style="width:${s}px; height:${s}px; border-color:${ESCALA_CORES[i]}; ${rs.valor === i ? `background:${ESCALA_CORES[i]};` : ''}"
                  aria-label="opcao ${i + 1}"></button>
        `).join('')}
        <span class="escala-label right">Adoro</span>
      </div>
    </div>
  `;

  wrap.querySelector('.limite-btn').addEventListener('click', () => {
    rs.limite = !rs.limite;
    if (rs.limite) rs.nunca = false;
    onChange();
  });
  wrap.querySelector('.check-nunca input').addEventListener('click', (e) => {
    rs.nunca = e.target.checked;
    if (rs.nunca) rs.limite = false;
    onChange();
  });
  wrap.querySelectorAll('.escala-circulo').forEach(btn => {
    btn.addEventListener('click', () => {
      rs.valor = Number(btn.dataset.idx);
      onChange();
    });
  });

  return wrap;
}

// ---------- RESULTADO ----------

function classificarResposta(rs) {
  if (rs.limite) return { label: 'Limite rígido', cor: '#E24B4A' };
  if (rs.nunca) return { label: 'Nunca experimentei', cor: '#74747E' };
  if (rs.valor !== null) return { label: null, cor: ESCALA_CORES[rs.valor], nivel: rs.valor };
  return null;
}

// Agrupa respostas por categoria e calcula os totais do resumo geral.
// Faixas do resumo (baseadas no índice 0-6 da escala): 5-6 = Adora, 2-4 = Aceita.
function calcularResumo(categorias, respostas) {
  const porCategoria = {};
  let totalPerguntas = 0;
  let totalAdora = 0, totalAceita = 0, totalLimite = 0, totalNunca = 0;

  categorias.forEach(cat => {
    cat.perguntas.forEach(p => {
      totalPerguntas++;
      const estado = respostas[p.id];
      const linhas = [];

      ['fazer', 'receber'].forEach(chave => {
        if (estado.modo !== chave && estado.modo !== 'ambos') return;
        const rs = estado[chave];
        const cls = classificarResposta(rs);
        if (!cls) return;
        linhas.push({ tipo: chave, ...cls });

        if (rs.limite) totalLimite++;
        else if (rs.nunca) totalNunca++;
        else if (rs.valor >= 5) totalAdora++;
        else if (rs.valor >= 2) totalAceita++;
      });

      if (linhas.length > 0) {
        if (!porCategoria[cat.nome]) porCategoria[cat.nome] = [];
        porCategoria[cat.nome].push({ texto: p.texto, linhas });
      }
    });
  });

  return { porCategoria, totalPerguntas, totalAdora, totalAceita, totalLimite, totalNunca };
}

function renderResultado() {
  limparProgressoLocal();
  const resumo = calcularResumo(categoriasQuestionario, respostasUsuario);
  const categoriasComRespostas = Object.keys(resumo.porCategoria);
  const totalRespondidas = Object.values(resumo.porCategoria).reduce((sum, arr) => sum + arr.length, 0);
  const perfil = respostasPerfil.quemVoceE;

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 100%"></div></div>

    <div class="resultado-header">
      <h1>Resultados</h1>
      <div class="resultado-header-acoes">
        <button class="btn-outline" id="btn-comparar">Comparar com outro perfil</button>
        <button class="btn-outline" id="btn-exportar-pdf">Exportar PDF</button>
      </div>
    </div>

    <div class="card resultado-card">
      <div class="perfil-cards">
        <div class="perfil-stat"><span class="perfil-stat-label">Posição</span><span class="perfil-stat-valor">${perfil.posicao || '—'}</span></div>
        <div class="perfil-stat"><span class="perfil-stat-label">Tolerância à dor</span><span class="perfil-stat-valor">${perfil.dor || '—'}</span></div>
        <div class="perfil-stat"><span class="perfil-stat-label">Experiência teórica</span><span class="perfil-stat-valor">${perfil.teorica || '—'}</span></div>
        <div class="perfil-stat"><span class="perfil-stat-label">Experiência prática</span><span class="perfil-stat-valor">${perfil.pratica || '—'}</span></div>
      </div>

      ${respostasPerfil.tipoRelacionamento.length > 0 ? `
        <p class="tags-titulo">Tipos de Relacionamento</p>
        <div class="categorias-respondidas">
          ${respostasPerfil.tipoRelacionamento.map(t => `<span class="chip-info chip-info-rosa">${t}</span>`).join('')}
        </div>
      ` : ''}

      ${respostasPerfil.locais.length > 0 ? `
        <p class="tags-titulo">Locais de Interesse</p>
        <div class="categorias-respondidas">
          ${respostasPerfil.locais.map(l => `<span class="chip-info chip-info-laranja">${l}</span>`).join('')}
        </div>
      ` : ''}

      <p class="tags-titulo">Categorias Respondidas</p>
      <div class="categorias-respondidas">
        ${categoriasComRespostas.map(cat => `<span class="chip-info">${cat}</span>`).join('')}
      </div>

      <div class="resumo-stats">
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#3B6D11">${resumo.totalAdora}</span><span class="resumo-stat-label">Adora</span></div>
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#EF9F27">${resumo.totalAceita}</span><span class="resumo-stat-label">Aceita</span></div>
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#E24B4A">${resumo.totalLimite}</span><span class="resumo-stat-label">Limites Rígidos</span></div>
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#74747E">${resumo.totalNunca}</span><span class="resumo-stat-label">Nunca Experimentou</span></div>
      </div>

      <p class="grafico-titulo">Perfil por tópico</p>
      <div class="grafico-radar">${renderGraficoRadarHtml(categoriasQuestionario, respostasUsuario)}</div>

      <p class="subtitle">${totalRespondidas} de ${resumo.totalPerguntas} perguntas respondidas, em ${categoriasComRespostas.length} tópicos.</p>

      <div class="compartilhar-box">
        <p class="compartilhar-titulo">Compartilhar resultados</p>
        <button class="btn-primary" id="btn-copiar-link">Copiar link de compartilhamento</button>
        <p class="compartilhar-status" id="compartilhar-status"></p>
      </div>

      <div class="resumo-lista">
        ${categoriasComRespostas.length === 0 ? `<p class="subtitle">Nenhuma resposta registrada ainda.</p>` : ''}
        ${categoriasComRespostas.map(cat => `
          <div class="resumo-categoria">
            <div class="resumo-categoria-titulo">${cat}</div>
            ${resumo.porCategoria[cat].map(item => `
              <div class="resumo-item">
                <span class="resumo-item-texto">${item.texto}</span>
                <span class="resumo-badges">
                  ${item.linhas.map(l => `
                    <span class="badge" style="background:${l.cor}22; color:${l.cor}; border:1px solid ${l.cor}66;">
                      ${l.tipo === 'fazer' ? 'Fazer' : 'Receber'}${l.label ? ' · ' + l.label : ''}
                    </span>
                  `).join('')}
                </span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-copiar-link').addEventListener('click', async () => {
    const status = document.getElementById('compartilhar-status');
    status.textContent = 'Gerando link...';
    try {
      const resultado = await copiarLinkCompartilhamento();
      if (resultado.ok) {
        status.textContent = resultado.encurtado ? 'Link curto copiado!' : 'Link copiado (encurtador indisponível no momento, este é o link completo).';
      } else if (resultado.erro) {
        status.textContent = resultado.erro;
      } else if (resultado.url) {
        status.textContent = 'Não copiei automaticamente, mas aqui está o link: ' + resultado.url;
      } else {
        status.textContent = 'Não consegui gerar o link. Tenta de novo.';
      }
    } catch (e) {
      console.error('Erro inesperado ao gerar link:', e);
      status.textContent = 'Algo deu errado ao gerar o link. Veja o console (F12) pra detalhes.';
    }
  });

  document.getElementById('btn-exportar-pdf').addEventListener('click', exportarResultadoPDF);
  document.getElementById('btn-comparar').addEventListener('click', renderTelaComparar);
}

// ---------- COMPARAR COM OUTRO PERFIL (via link colado) ----------

function renderTelaComparar() {
  app.innerHTML = `
    <div class="card">
      <h1>Comparar com outro perfil</h1>
      <p class="subtitle">Cole aqui o link de compartilhamento que a outra pessoa te enviou.</p>
      <textarea id="input-link-comparar" class="input-link" rows="3" placeholder="Cole o link aqui..."></textarea>
      <p class="compartilhar-status" id="comparar-erro"></p>
      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-voltar-comparar">Voltar</button>
        <button class="btn-primary" id="btn-calcular-match">Calcular compatibilidade</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-comparar').addEventListener('click', renderResultado);

  document.getElementById('btn-calcular-match').addEventListener('click', async () => {
    const valorOriginal = document.getElementById('input-link-comparar').value.trim();
    const erro = document.getElementById('comparar-erro');
    const botao = document.getElementById('btn-calcular-match');

    if (!valorOriginal) {
      erro.textContent = 'Cole o link antes de calcular.';
      return;
    }

    erro.textContent = '';
    botao.disabled = true;
    botao.textContent = 'Calculando...';

    try {
      let valorResolvido = valorOriginal;
      if (!valorResolvido.includes('#ver=')) {
        valorResolvido = await resolverLinkCurto(valorResolvido);
      }

      const marcador = '#ver=';
      const idx = valorResolvido.indexOf(marcador);
      if (idx === -1) {
        erro.textContent = 'Isso não parece um link deste app. Confira se copiou o link certo.';
        return;
      }

      const token = valorResolvido.slice(idx + marcador.length);

      let pacoteOutro;
      try {
        pacoteOutro = expandirPacote(decodificarPacote(token));
      } catch (e) {
        erro.textContent = 'Não consegui ler esse link — ele pode estar incompleto ou cortado ao copiar.';
        return;
      }

      if (!pacoteOutro.categorias || pacoteOutro.categorias.length === 0) {
        erro.textContent = 'Esse link não tem nenhuma resposta pra comparar.';
        return;
      }

      const meuPerfil = { categorias: categoriasQuestionario, respostas: respostasUsuario };
      const match = compararPerfis(meuPerfil, pacoteOutro);
      renderResultadoComparacao(match);
    } catch (e) {
      erro.textContent = 'Não consegui resolver esse link curto agora. Tente colar o link completo, ou tente de novo em instantes.';
    } finally {
      botao.disabled = false;
      botao.textContent = 'Calcular compatibilidade';
    }
  });
}

function renderResultadoComparacao(match) {
  app.innerHTML = `
    <div class="card">
      <h1>Compatibilidade</h1>
      <div class="score-compatibilidade">${match.scoreGeral}%</div>
      <p class="subtitle">Baseado em ${match.totalComparado} pergunta(s) em comum.</p>

      ${match.scorePorCategoria.length > 0 ? `
        <div class="score-categorias">
          ${match.scorePorCategoria.map(c => `
            <div class="score-categoria-linha">
              <span class="score-categoria-nome">${c.nome}</span>
              <div class="score-categoria-barra"><div class="score-categoria-preenchido" style="width:${c.score}%"></div></div>
              <span class="score-categoria-valor">${c.score}%</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${renderGrupoMatch('Alta compatibilidade', match.perfect, '#3B6D11')}
      ${renderGrupoMatch('Boa compatibilidade', match.good, '#639922')}
      ${renderGrupoMatch('Potencial', match.potential, '#EF9F27')}
      ${renderGrupoMatch('Conflitos (limite rígido)', match.conflicts, '#E24B4A', true)}

      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-voltar-match">Voltar aos meus resultados</button>
      </div>
    </div>
  `;
  document.getElementById('btn-voltar-match').addEventListener('click', renderResultado);
}

function renderGrupoMatch(titulo, itens, cor, mostrarMotivo) {
  if (itens.length === 0) return '';
  return `
    <div class="match-grupo">
      <div class="match-grupo-titulo" style="color:${cor}">${titulo} (${itens.length})</div>
      ${itens.map(i => `
        <div class="match-item">
          <span>${i.texto}</span>
          ${mostrarMotivo && i.motivo ? `<span class="match-motivo">${i.motivo}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ---------- PERFIL COMPARTILHADO (visualização somente leitura, via link) ----------

function renderPerfilCompartilhado(pacote) {
  const resumo = calcularResumo(pacote.categorias, pacote.respostas);
  const categoriasComRespostas = Object.keys(resumo.porCategoria);
  const perfil = pacote.perfil.quemVoceE || {};

  app.innerHTML = `
    <div class="card resultado-card">
      <h1>Perfil compartilhado</h1>
      <p class="subtitle">Alguém compartilhou este resultado com você.</p>

      <div class="perfil-cards">
        <div class="perfil-stat"><span class="perfil-stat-label">Posição</span><span class="perfil-stat-valor">${perfil.posicao || '—'}</span></div>
        <div class="perfil-stat"><span class="perfil-stat-label">Tolerância à dor</span><span class="perfil-stat-valor">${perfil.dor || '—'}</span></div>
        <div class="perfil-stat"><span class="perfil-stat-label">Experiência teórica</span><span class="perfil-stat-valor">${perfil.teorica || '—'}</span></div>
        <div class="perfil-stat"><span class="perfil-stat-label">Experiência prática</span><span class="perfil-stat-valor">${perfil.pratica || '—'}</span></div>
      </div>

      ${(pacote.perfil.tipoRelacionamento || []).length > 0 ? `
        <p class="tags-titulo">Tipos de Relacionamento</p>
        <div class="categorias-respondidas">
          ${pacote.perfil.tipoRelacionamento.map(t => `<span class="chip-info chip-info-rosa">${t}</span>`).join('')}
        </div>
      ` : ''}

      ${(pacote.perfil.locais || []).length > 0 ? `
        <p class="tags-titulo">Locais de Interesse</p>
        <div class="categorias-respondidas">
          ${pacote.perfil.locais.map(l => `<span class="chip-info chip-info-laranja">${l}</span>`).join('')}
        </div>
      ` : ''}

      <p class="tags-titulo">Categorias Respondidas</p>
      <div class="categorias-respondidas">
        ${categoriasComRespostas.map(cat => `<span class="chip-info">${cat}</span>`).join('')}
      </div>

      <div class="resumo-stats">
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#3B6D11">${resumo.totalAdora}</span><span class="resumo-stat-label">Adora</span></div>
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#EF9F27">${resumo.totalAceita}</span><span class="resumo-stat-label">Aceita</span></div>
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#E24B4A">${resumo.totalLimite}</span><span class="resumo-stat-label">Limites Rígidos</span></div>
        <div class="resumo-stat"><span class="resumo-stat-num" style="color:#74747E">${resumo.totalNunca}</span><span class="resumo-stat-label">Nunca Experimentou</span></div>
      </div>


      <p class="grafico-titulo">Perfil por tópico</p>
      <div class="grafico-radar">${renderGraficoRadarHtml(pacote.categorias, pacote.respostas)}</div>
      <div class="resumo-lista">
        ${categoriasComRespostas.map(cat => `
          <div class="resumo-categoria">
            <div class="resumo-categoria-titulo">${cat}</div>
            ${resumo.porCategoria[cat].map(item => `
              <div class="resumo-item">
                <span class="resumo-item-texto">${item.texto}</span>
                <span class="resumo-badges">
                  ${item.linhas.map(l => `
                    <span class="badge" style="background:${l.cor}22; color:${l.cor}; border:1px solid ${l.cor}66;">
                      ${l.tipo === 'fazer' ? 'Fazer' : 'Receber'}${l.label ? ' · ' + l.label : ''}
                    </span>
                  `).join('')}
                </span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>

      <div class="nav-rodape">
        <button class="btn-primary" id="btn-comecar-meu">Fazer meu próprio questionário</button>
      </div>
    </div>
  `;

  document.getElementById('btn-comecar-meu').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    renderPerfilCompleto();
  });
}

// ---------- RETOMAR PROGRESSO SALVO ----------

function renderTelaRetomar(salvo) {
  app.innerHTML = `
    <div class="card">
      <h1>Continuar de onde parou?</h1>
      <p class="subtitle">Encontramos um questionário em andamento neste navegador.</p>
      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-comecar-de-novo">Começar de novo</button>
        <button class="btn-primary" id="btn-continuar-progresso">Continuar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-comecar-de-novo').addEventListener('click', () => {
    limparProgressoLocal();
    renderPerfilCompleto();
  });

  document.getElementById('btn-continuar-progresso').addEventListener('click', () => {
    respostasPerfil = salvo.respostasPerfil || { quemVoceE: {}, tipoRelacionamento: [], locais: [] };
    categoriasSelecionadas = salvo.categoriasSelecionadas || [];
    respostasUsuario = salvo.respostasUsuario || {};

    if (salvo.etapa === 'questionario') {
      const ruleEngine = new RuleEngine(dataManager.perfil.regrasCondicionais);
      categoriasDisponiveis = ruleEngine.categoriasAplicaveis(dataManager.categorias, respostasPerfil);
      montarCategoriasQuestionario();
      indiceCategoria = Math.min(salvo.indiceCategoria || 0, categoriasQuestionario.length - 1);
      renderCategoria();
    } else {
      renderPerfilCompleto();
    }
  });
}

// ---------- INICIALIZAÇÃO ----------

dataManager.carregarTudo().then(() => {
  if (verificarLinkCompartilhado()) return;

  const salvo = carregarProgressoLocal();
  if (salvo) {
    renderTelaRetomar(salvo);
  } else {
    renderPerfilCompleto();
  }
}).catch(err => {
  app.innerHTML = `<div class="card"><h1>Erro ao carregar dados</h1><p class="subtitle">${err.message}</p></div>`;
  console.error(err);
});
