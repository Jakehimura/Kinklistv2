/**
 * RuleEngine
 * -----------
 * Aplica as regras condicionais definidas em data/perfil.json (campo
 * "regrasCondicionais") sobre a lista de categorias, com base nas
 * respostas do perfil.
 *
 * Formato de uma regra:
 * {
 *   quando: { pergunta: "relacionamento", valor: "2-pessoas" },
 *   acao: { removerCategorias: ["menage-grupal"] }
 * }
 *
 * Para adicionar uma nova regra no futuro, basta acrescentar um objeto
 * nesse array no perfil.json — não precisa mexer neste arquivo.
 * Ações suportadas hoje: "removerCategorias" (lista de ids de categoria).
 * Dá pra estender facilmente com "removerItens" (lista de {categoriaId, item})
 * se precisar remover práticas específicas dentro de uma categoria mantida.
 */

class RuleEngine {
  constructor(regras) {
    this.regras = regras || [];
  }

  // respostasPerfil: { [perguntaId]: valorEscolhido }
  categoriasAplicaveis(categorias, respostasPerfil) {
    const idsParaRemover = new Set();

    this.regras.forEach(regra => {
      const respostaAtual = respostasPerfil[regra.quando.pergunta];
      if (respostaAtual === regra.quando.valor) {
        (regra.acao.removerCategorias || []).forEach(id => idsParaRemover.add(id));
      }
    });

    return categorias.filter(cat => !idsParaRemover.has(cat.id));
  }
}
