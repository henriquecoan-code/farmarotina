// Permissões no navegador (espelham o firestore.rules, que é quem realmente protege os dados).
export const MODULOS = [
  { id: 'clientes', nome: 'Clientes' },
  { id: 'saude', nome: 'Saúde (aferições e injetáveis)' },
  { id: 'temperatura', nome: 'Temperatura' },
  { id: 'atendimento', nome: 'Atendimento' },
  { id: 'notas', nome: 'Notas fiscais' },
  { id: 'fornecedores', nome: 'Fornecedores' },
  { id: 'pops', nome: 'POPs (leitura)' },
];

export const PERFIS = {
  'Farmacêutico': MODULOS.map((m) => m.id),
  'Atendente': ['clientes', 'temperatura', 'atendimento', 'fornecedores', 'pops'],
};

let perfil = null;
export const definirPerfil = (p) => { perfil = p; };
export const obterPerfilAtual = () => perfil;

export const ehAdmin = () => perfil?.papel === 'admin' && perfil?.ativo === true;
export const podeVer = (modulo) => ehAdmin() || (perfil?.ativo === true && (perfil.modulos || []).includes(modulo));
export const podeEditar = (schema) => (schema.somenteAdmin ? ehAdmin() : podeVer(schema.modulo));
export const podeExcluir = () => ehAdmin();
