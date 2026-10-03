// Cole aqui o objeto firebaseConfig do seu projeto
// (Console do Firebase → Configurações do projeto → Seus apps → App da Web).
// Enquanto projectId estiver vazio, o app roda em MODO DEMONSTRAÇÃO,
// com dados de exemplo salvos só neste navegador.
export const NOME_APP = 'FarmaRotina';

// Nome da farmácia usado nas mensagens de WhatsApp ("Olá, Maria! Aqui é da Farmácia Exemplo.").
// Deixe vazio para usar só "da farmácia".
export const NOME_FARMACIA = 'Farmácia São Benedito';

export const firebaseConfig = {
  apiKey: "AIzaSyDCb39Foro39c4NrGZjIDfIi3u43ccV-kw",
  authDomain: "farmarotina-ed7c3.firebaseapp.com",
  projectId: "farmarotina-ed7c3",
  storageBucket: "farmarotina-ed7c3.firebasestorage.app",
  messagingSenderId: "1046718774548",
  appId: "1:1046718774548:web:402ffa79795dd22f0a1601",
  measurementId: "G-W8K04MXZ44"
};

export const DEMO = !firebaseConfig.projectId;