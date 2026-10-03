// Cole aqui o objeto firebaseConfig do seu projeto
// (Console do Firebase → Configurações do projeto → Seus apps → App da Web).
// Enquanto projectId estiver vazio, o app roda em MODO DEMONSTRAÇÃO,
// com dados de exemplo salvos só neste navegador.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDCb39Foro39c4NrGZjIDfIi3u43ccV-kw",
  authDomain: "farmarotina-ed7c3.firebaseapp.com",
  projectId: "farmarotina-ed7c3",
  storageBucket: "farmarotina-ed7c3.firebasestorage.app",
  messagingSenderId: "1046718774548",
  appId: "1:1046718774548:web:402ffa79795dd22f0a1601",
  measurementId: "G-W8K04MXZ44"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);