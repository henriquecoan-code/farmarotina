// Permissões no navegador (espelham o firestore.rules, que é quem realmente protege os dados).
export const MODULOS = [
  { id: 'clientes', nome: 'Clientes' },
  { id: 'saude', nome: 'Saúde (aferições e injetáveis)' },
  { id: 'temperatura', nome: 'Temperatura' },
  { id: 'atendimento', nome: 'Atendimento' },
  { id: 'trocas', nome: 'Trocas entre farmácias' },
  { id: 'notas', nome: 'Anotações (clientes e controle)' },
  { id: 'fornecedores', nome: 'Fornecedores' },
  { id: 'pops', nome: 'POPs (leitura)' },
  { id: 'rotinas', nome: 'Rotinas (mensais, semanais…)' },
  { id: 'pedido', nome: 'Pedido de compras' },
  { id: 'historico', nome: 'Histórico de vendas' },
  // Consultas ao sistema da farmácia (Trier), na página separada consultas/consulta.html
  { id: 'crediario', nome: 'Crediário (consulta no Trier)', grupo: 'consultas' },
  { id: 'produtos', nome: 'Produtos (consulta no Trier)', grupo: 'consultas' },
  { id: 'orcamento', nome: 'Orçamento (preços do Trier, sem custo)', grupo: 'consultas' },
];

export const PERFIS = {
  'Farmacêutico': MODULOS.map((m) => m.id),
  'Atendente': ['clientes', 'temperatura', 'atendimento', 'trocas', 'notas', 'fornecedores', 'pops', 'orcamento'],
};

let perfil = null;
export const definirPerfil = (p) => { perfil = p; };
export const obterPerfilAtual = () => perfil;

export const ehAdmin = () => perfil?.papel === 'admin' && perfil?.ativo === true;
export const podeVer = (modulo) => ehAdmin() || (perfil?.ativo === true && (perfil.modulos || []).includes(modulo));
export const podeEditar = (schema) => (schema.somenteAdmin ? ehAdmin() : podeVer(schema.modulo));
export const podeExcluir = () => ehAdmin();
