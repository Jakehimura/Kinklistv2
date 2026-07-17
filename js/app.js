const app = document.getElementById('app');

const ESCALA_CORES = ['#BA7517', '#EF9F27', '#FAC775', '#C9C9D2', '#97C459', '#639922', '#3B6D11'];
const ESCALA_TAMANHOS = [26, 22, 18, 14, 18, 22, 26];

let listaPerguntas = [];
let indice = 0;
let respostasPerfil = { quemVoceE: {}, tipoRelacionamento: [], locais: [] };
let respostasUsuario = {};

let passoPerfilAtual = 0;

function estadoLinhaVazio() {
  return { limite: false, nunca: false, valor: null };
}
function estadoPerguntaVazio() {
  return { modo: 'ambos', fazer: estadoLinhaVazio(), receber: estadoLinhaVazio() };
}

// ---------- PERFIL: "Quem é você?" (selects) ----------

function renderQuemVoceE() {
  const secao = dataManager.perfil.quemVoceE;
  const respostas = respostasPerfil.quemVoceE;

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 5%"></div></div>
    <div class="card">
      <h1>${secao.titulo}</h1>
      <div class="campos-select">
        ${secao.campos.map(campo => `
          <label class="campo-select">
            <span>${campo.label}</span>
            <select data-campo="${campo.id}">
              ${campo.opcoes.map(o => `<option value="${o}" ${respostas[campo.id] === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </label>
        `).join('')}
      </div>
      <button class="btn-primary" id="btn-continuar">Continuar</button>
    </div>
  `;

  app.querySelectorAll('select[data-campo]').forEach(sel => {
    respostas[sel.dataset.campo] = sel.value;
    sel.addEventListener('change', () => { respostas[sel.dataset.campo] = sel.value; });
  });

  document.getElementById('btn-continuar').addEventListener('click', () => {
    passoPerfilAtual = 1;
    renderMultiSelecao('tipoRelacionamento');
  });
}

// ---------- PERFIL: seções de múltipla escolha ----------

function renderMultiSelecao(chave) {
  const secao = dataManager.perfil[chave];
  const selecionadas = respostasPerfil[chave];
  const progresso = chave === 'tipoRelacionamento' ? 12 : 19;

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: ${progresso}%"></div></div>
    <div class="card">
      <h1>${secao.titulo}</h1>
      ${secao.subtitulo ? `<p class="subtitle">${secao.subtitulo}</p>` : ''}
      <div class="chips-grupo">
        ${secao.opcoes.map(o => `
          <button class="chip ${selecionadas.includes(o) ? 'selected' : ''}" data-valor="${o}">${o}</button>
        `).join('')}
      </div>
      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-voltar">Voltar</button>
        <button class="btn-primary" id="btn-continuar">Continuar</button>
      </div>
    </div>
  `;

  app.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const valor = chip.dataset.valor;
      const idx = selecionadas.indexOf(valor);
      if (idx === -1) selecionadas.push(valor); else selecionadas.splice(idx, 1);
      chip.classList.toggle('selected');
    });
  });

  document.getElementById('btn-voltar').addEventListener('click', () => {
    if (chave === 'tipoRelacionamento') {
      passoPerfilAtual = 0;
      renderQuemVoceE();
    } else {
      passoPerfilAtual = 1;
      renderMultiSelecao('tipoRelacionamento');
    }
  });

  document.getElementById('btn-continuar').addEventListener('click', () => {
    if (chave === 'tipoRelacionamento') {
      passoPerfilAtual = 2;
      renderMultiSelecao('locais');
    } else {
      iniciarQuestionario();
    }
  });
}

// ---------- MONTAGEM DA LISTA DE PERGUNTAS ----------

function iniciarQuestionario() {
  const ruleEngine = new RuleEngine(dataManager.perfil.regrasCondicionais);
  const categoriasFiltradas = ruleEngine.categoriasAplicaveis(dataManager.categorias, respostasPerfil);

  listaPerguntas = [];
  categoriasFiltradas.forEach(cat => {
    const itens = dataManager.perguntas[cat.id] || [];
    itens.forEach(texto => {
      const id = cat.id + '::' + texto;
      listaPerguntas.push({ id, categoriaNome: cat.nome, texto });
      if (!respostasUsuario[id]) respostasUsuario[id] = estadoPerguntaVazio();
    });
  });

  indice = 0;
  renderPergunta();
}

// ---------- PERGUNTAS (questionário) ----------

function renderPergunta() {
  const atual = listaPerguntas[indice];
  const estado = respostasUsuario[atual.id];
  const progresso = 25 + Math.round(((indice + 1) / listaPerguntas.length) * 75);

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: ${progresso}%"></div></div>
    <div class="card">
      <div class="categoria-eyebrow">${atual.categoriaNome}</div>
      <p class="pergunta-titulo">${atual.texto}</p>

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

      <div class="linhas-resposta" id="linhas"></div>

      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-voltar">Voltar</button>
        <button class="btn-primary" id="btn-proximo">
          ${indice === listaPerguntas.length - 1 ? 'Ver resultado' : 'Próxima'}
        </button>
      </div>
    </div>
  `;

  atualizarSwitchesUI(estado);
  renderLinhas(atual.id);

  app.querySelectorAll('.sw-item').forEach(item => {
    item.addEventListener('click', () => alternarModo(atual.id, item.dataset.modo));
  });

  document.getElementById('btn-voltar').addEventListener('click', () => {
    if (indice > 0) {
      indice--;
      renderPergunta();
    } else {
      passoPerfilAtual = 2;
      renderMultiSelecao('locais');
    }
  });

  document.getElementById('btn-proximo').addEventListener('click', () => {
    if (indice < listaPerguntas.length - 1) {
      indice++;
      renderPergunta();
    } else {
      renderResultado();
    }
  });
}

function alternarModo(perguntaId, modo) {
  respostasUsuario[perguntaId].modo = modo;
  atualizarSwitchesUI(respostasUsuario[perguntaId]);
  renderLinhas(perguntaId);
}

function atualizarSwitchesUI(estado) {
  app.querySelectorAll('.sw-item').forEach(item => {
    const modo = item.dataset.modo;
    const ligado = modo === 'ambos' ? estado.modo === 'ambos' : (estado.modo === modo);
    item.querySelector('.switch').classList.toggle('on', ligado);
  });
}

function renderLinhas(perguntaId) {
  const estado = respostasUsuario[perguntaId];
  const container = document.getElementById('linhas');
  container.innerHTML = '';

  if (estado.modo === 'fazer' || estado.modo === 'ambos') container.appendChild(criarLinha(perguntaId, 'fazer', 'Fazer'));
  if (estado.modo === 'receber' || estado.modo === 'ambos') container.appendChild(criarLinha(perguntaId, 'receber', 'Receber'));
}

function criarLinha(perguntaId, chave, label) {
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
    renderLinhas(perguntaId);
  });
  wrap.querySelector('.check-nunca input').addEventListener('click', (e) => {
    rs.nunca = e.target.checked;
    if (rs.nunca) rs.limite = false;
    renderLinhas(perguntaId);
  });
  wrap.querySelectorAll('.escala-circulo').forEach(btn => {
    btn.addEventListener('click', () => {
      rs.valor = Number(btn.dataset.idx);
      renderLinhas(perguntaId);
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

function renderResultado() {
  const porCategoria = {};

  listaPerguntas.forEach(p => {
    const estado = respostasUsuario[p.id];
    const linhas = [];

    ['fazer', 'receber'].forEach(chave => {
      if (estado.modo !== chave && estado.modo !== 'ambos') return;
      const cls = classificarResposta(estado[chave]);
      if (cls) linhas.push({ tipo: chave, ...cls });
    });

    if (linhas.length > 0) {
      if (!porCategoria[p.categoriaNome]) porCategoria[p.categoriaNome] = [];
      porCategoria[p.categoriaNome].push({ texto: p.texto, linhas });
    }
  });

  const categoriasComRespostas = Object.keys(porCategoria);
  const totalRespondidas = Object.values(porCategoria).reduce((sum, arr) => sum + arr.length, 0);

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 100%"></div></div>
    <div class="card resultado-card">
      <h1>Resumo dos resultados</h1>
      <p class="subtitle">${totalRespondidas} de ${listaPerguntas.length} perguntas respondidas, em ${categoriasComRespostas.length} categorias.</p>

      <div class="resumo-lista">
        ${categoriasComRespostas.length === 0 ? `<p class="subtitle">Nenhuma resposta registrada ainda.</p>` : ''}
        ${categoriasComRespostas.map(cat => `
          <div class="resumo-categoria">
            <div class="resumo-categoria-titulo">${cat}</div>
            ${porCategoria[cat].map(item => `
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
}

// ---------- INICIALIZAÇÃO ----------

dataManager.carregarTudo().then(() => {
  renderQuemVoceE();
}).catch(err => {
  app.innerHTML = `<div class="card"><h1>Erro ao carregar dados</h1><p class="subtitle">${err.message}</p></div>`;
  console.error(err);
});
