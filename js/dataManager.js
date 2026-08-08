class DataManager {
  constructor() {
    this.categorias = [];
    this.perguntas = {};
    this.perfil = { perguntasPerfil: [], regrasCondicionais: [] };
    this.explicacoes = {};
  }

  async carregarTudo() {
    const [catRes, perRes, perfilRes] = await Promise.all([
      fetch('data/categorias.json'),
      fetch('data/perguntas.json'),
      fetch('data/perfil.json')
    ]);

    const catJson = await catRes.json();
    const perJson = await perRes.json();
    const perfilJson = await perfilRes.json();

    this.categorias = catJson.categorias.sort((a, b) => a.ordem - b.ordem);
    this.perguntas = perJson.perguntas;
    this.perfil = perfilJson;

    try {
      const expRes = await fetch('data/explicacoes.json');
      const expJson = await expRes.json();
      this.explicacoes = expJson.explicacoes || {};
    } catch (e) {
      console.warn('Não foi possível carregar explicações (não é crítico):', e);
      this.explicacoes = {};
    }

    return this;
  }

  obterExplicacao(categoriaId, texto) {
    return this.explicacoes[categoriaId + '::' + texto] || null;
  }
}

const dataManager = new DataManager();
