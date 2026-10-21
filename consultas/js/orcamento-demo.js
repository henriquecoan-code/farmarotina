// Busca de produtos do orçamento no modo demonstração: usa os produtos fictícios da consulta de Produtos,
// sem custo nem margem (como a rota de verdade da ponte).
import { demoProdutos } from './produtos-demo.js';

export function demoOrcamento(caminho) {
  const busca = new URL(caminho, 'http://demo').searchParams.get('busca') || '';
  return demoProdutos(`/?busca=${encodeURIComponent(busca)}`)
    .map(({ id, nome, laboratorio, concentracao, quantidade, estoque, pmc, venda, desconto }) => ({
      id, nome, laboratorio, concentracao, quantidade, estoque, pmc, venda, desconto, descontoMaximo: 50,
    }));
}
