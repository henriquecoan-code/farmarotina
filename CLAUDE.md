# FarmaRotina

## Visão geral do código

App (PWA) da Farmácia São Benedito para rotinas, registros de saúde, trocas, POPs e consultas ao sistema da farmácia (Trier). HTML/CSS/JS puros, sem build, publicado no GitHub Pages, com dados no Firebase. As consultas ao Trier passam por uma ponte Node local, somente leitura.

**Stack:** módulos ES sem bundler, Firebase Auth + Firestore (SDK por CDN), Chart.js e SheetJS por CDN, Node + `pg` na ponte.
**Estrutura:**
- `js/`: app principal; um schema por módulo em `js/modulos/`, telas genéricas em `js/paginas/`.
- `consultas/`: páginas que leem o Trier pela ponte.
- `compras/`: pedido e histórico de vendas.
- `ponte/`: servidor local do Trier.
- `firestore.rules`: segurança.

Para a arquitetura detalhada, veja [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Cuidados

- O repositório é **público**: nunca commitar senhas (`C:\FarmaRotinaPonte\config.json`, `ponte/config.exemplo.json` só com exemplos) nem relatórios, `.db` ou `.json` com dados de vendas ou de clientes.
- Depois de mudar o `firestore.rules`, ele precisa ser **publicado à mão** no console do Firebase.
- Depois de mudar a `ponte/`, subir o `VERSAO` em `ponte/servidor.js` e reiniciar a ponte nos computadores da farmácia.
- Para testar sem tocar nos dados reais: uma cópia com `projectId` vazio em `js/config.js` entra em modo demonstração.
