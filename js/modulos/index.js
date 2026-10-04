// Registro de todos os módulos. Para criar um novo, descreva o schema e adicione aqui
// (e crie a regra correspondente no firestore.rules).
import { afericoes, injetaveis } from './saude.js';
import { temperatura } from './temperatura.js';
import { clientes, atendimentos, notas, fornecedores, pops } from './cadastros.js';
import { trocas, parceiros } from './trocas.js';
import { podeVer } from '../perm.js';

export const SCHEMAS = [afericoes, injetaveis, temperatura, atendimentos, trocas, parceiros, clientes, notas, fornecedores, pops];

export const schemaPorId = (id) => SCHEMAS.find((s) => s.id === id);
export const visiveis = () => SCHEMAS.filter((s) => podeVer(s.modulo));
