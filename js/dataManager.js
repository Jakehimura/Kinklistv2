class DataManager {
  constructor() {
    this.categorias = [];
    this.perguntas = {};
    this.perfil = { perguntasPerfil: [], regrasCondicionais: [] };
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

    return this;
  }
}

const dataManager = new DataManager();
