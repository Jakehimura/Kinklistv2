const app = document.getElementById('app');

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

function renderQuemVoceE() {
  const secao = dataManager.perfil.quemVoceE;
  const respostas = respostasPerfil.quemVoceE;

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 4%"></div></div>
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

  document.getElementById('btn-continuar').addEventListener('click', () => renderMultiSelecao('tipoRelacionamento'));
}

// ---------- PERFIL: seções de múltipla escolha ----------

function renderMultiSelecao(chave) {
  const secao = dataManager.perfil[chave];
  const selecionadas = respostasPerfil[chave];
  const progresso = chave === 'tipoRelacionamento' ? 9 : 14;

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
    if (chave === 'tipoRelacionamento') renderQuemVoceE();
    else renderMultiSelecao('tipoRelacionamento');
  });

  document.getElementById('btn-continuar').addEventListener('click', () => {
    if (chave === 'tipoRelacionamento') renderMultiSelecao('locais');
    else renderSelecaoCategorias();
  });
}

// ---------- SELEÇÃO DE CATEGORIAS ----------

function renderSelecaoCategorias() {
  const ruleEngine = new RuleEngine(dataManager.perfil.regrasCondicionais);
  categoriasDisponiveis = ruleEngine.categoriasAplicaveis(dataManager.categorias, respostasPerfil);

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 20%"></div></div>
    <div class="card">
      <h1>O que você quer responder?</h1>
      <p class="subtitle">Selecione os tópicos. Você vai responder todas as perguntas de cada um antes de avançar.</p>
      <div class="chips-grupo chips-categorias">
        ${categoriasDisponiveis.map(cat => `
          <button class="chip ${categoriasSelecionadas.includes(cat.id) ? 'selected' : ''}" data-id="${cat.id}">${cat.nome}</button>
        `).join('')}
      </div>
      <div class="nav-rodape">
        <button class="btn-secundario" id="btn-voltar">Voltar</button>
        <button class="btn-primary" id="btn-iniciar" ${categoriasSelecionadas.length === 0 ? 'disabled' : ''}>Iniciar questionário</button>
      </div>
    </div>
  `;

  const btnIniciar = document.getElementById('btn-iniciar');

  app.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      const idx = categoriasSelecionadas.indexOf(id);
      if (idx === -1) categoriasSelecionadas.push(id); else categoriasSelecionadas.splice(idx, 1);
      chip.classList.toggle('selected');
      btnIniciar.disabled = categoriasSelecionadas.length === 0;
    });
  });

  document.getElementById('btn-voltar').addEventListener('click', () => renderMultiSelecao('locais'));
  btnIniciar.addEventListener('click', iniciarQuestionario);
}

// ---------- MONTAGEM DO QUESTIONÁRIO (agrupado por categoria) ----------

function iniciarQuestionario() {
  categoriasQuestionario = categoriasDisponiveis
    .filter(cat => categoriasSelecionadas.includes(cat.id))
    .map(cat => {
      const perguntas = (dataManager.perguntas[cat.id] || []).map(texto => {
        const id = cat.id + '::' + texto;
        if (!respostasUsuario[id]) respostasUsuario[id] = estadoPerguntaVazio();
        return { id, texto };
      });
      return { id: cat.id, nome: cat.nome, perguntas };
    });

  indiceCategoria = 0;
  renderCategoria();
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
      renderSelecaoCategorias();
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
}

function criarBlocoPergunta(perguntaId, texto) {
  const estado = respostasUsuario[perguntaId];

  const bloco = document.createElement('div');
  bloco.className = 'pergunta-bloco';
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

function renderResultado() {
  const porCategoria = {};
  let totalPerguntas = 0;

  categoriasQuestionario.forEach(cat => {
    cat.perguntas.forEach(p => {
      totalPerguntas++;
      const estado = respostasUsuario[p.id];
      const linhas = [];

      ['fazer', 'receber'].forEach(chave => {
        if (estado.modo !== chave && estado.modo !== 'ambos') return;
        const cls = classificarResposta(estado[chave]);
        if (cls) linhas.push({ tipo: chave, ...cls });
      });

      if (linhas.length > 0) {
        if (!porCategoria[cat.nome]) porCategoria[cat.nome] = [];
        porCategoria[cat.nome].push({ texto: p.texto, linhas });
      }
    });
  });

  const categoriasComRespostas = Object.keys(porCategoria);
  const totalRespondidas = Object.values(porCategoria).reduce((sum, arr) => sum + arr.length, 0);

  app.innerHTML = `
    <div class="progress"><div class="progress-fill" style="width: 100%"></div></div>
    <div class="card resultado-card">
      <h1>Resumo dos resultados</h1>
      <p class="subtitle">${totalRespondidas} de ${totalPerguntas} perguntas respondidas, em ${categoriasComRespostas.length} tópicos.</p>

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
