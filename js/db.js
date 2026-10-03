// Ponto único de acesso aos dados: escolhe Firebase ou demonstração conforme o config.js.
import { DEMO } from './config.js';

export const db = DEMO ? await import('./backend-demo.js') : await import('./backend-firebase.js');
