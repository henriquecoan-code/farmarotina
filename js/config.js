// Cole aqui o objeto firebaseConfig do seu projeto
// (Console do Firebase → Configurações do projeto → Seus apps → App da Web).
// Enquanto projectId estiver vazio, o app roda em MODO DEMONSTRAÇÃO,
// com dados de exemplo salvos só neste navegador.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const NOME_APP = 'FarmaRotina';
export const DEMO = !firebaseConfig.projectId;
