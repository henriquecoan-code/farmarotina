# FarmaRotina

App web (PWA) para registrar as rotinas e os POPs da farmácia. Funciona no computador e no celular, com várias pessoas usando ao mesmo tempo.

- **Saúde:** aferições de pressão, glicemia e oximetria, com alerta para valores alterados, e aplicação de injetáveis (lote, validade, via, receita).
- **Temperatura:** geladeira e ambiente, por turno, com alerta fora da faixa e aviso quando o turno ainda não foi registrado.
- **Clientes:** cadastro com consentimento LGPD e histórico completo.
- **Anotações gerais** com categoria e lembrete (aparece na tela inicial no dia).
- **Fornecedores** com horário limite para envio do pedido e prazo padrão de entrega.
- **Atendimento e POPs.**
- **Anexos com anotações** em qualquer registro (foto pela câmera ou arquivo).
- **Exportação CSV** (abre no Excel) e **impressão** por período, por exemplo a planilha mensal de temperatura.
- **Usuários com permissão por módulo:** o admin aprova cada pessoa e escolhe o que ela acessa.
- Funciona **offline**: o que for registrado sem internet sincroniza quando a conexão volta.

Tecnologias: HTML, CSS e JavaScript puros (sem build), Firebase Auth + Firestore (plano gratuito Spark) e hospedagem no GitHub Pages.

---

## 1. Testar agora (modo demonstração)

Enquanto o `js/config.js` estiver sem `projectId`, o app roda com dados de exemplo salvos só no navegador. Na tela inicial é possível entrar como administrador, farmacêutico ou atendente.

Para rodar localmente, abra um terminal na pasta do projeto e rode um destes comandos:

```bash
python -m http.server 8080
```

ou

```bash
npx serve .
```

Depois acesse http://localhost:8080. Abrir o `index.html` direto com duplo clique não funciona, porque os módulos JavaScript precisam de um servidor.

## 2. Criar o projeto no Firebase

1. Em https://console.firebase.google.com, clique em **Adicionar projeto** (o Google Analytics é opcional).
2. **Authentication** → Começar → Método de login → ative **E-mail/senha**.
3. **Firestore Database** → Criar banco de dados → escolha o local `southamerica-east1` (São Paulo) → modo de **produção**.
4. **Firestore → Regras:** apague o conteúdo, cole o arquivo [`firestore.rules`](firestore.rules) e clique em **Publicar**.
5. **Configurações do projeto** (engrenagem) → **Seus apps** → ícone `</>` (Web) → registre o app → copie o objeto `firebaseConfig` para o arquivo [`js/config.js`](js/config.js).

> A `apiKey` do Firebase não é secreta e pode ir para o GitHub. Quem protege os dados são as **regras** do passo 4.

## 3. Criar o primeiro administrador

1. Abra o app, vá em **Criar conta** e cadastre-se. Você vai ver a tela "Aguardando aprovação".
2. No console: **Firestore → Dados → `usuarios` →** o documento com o seu e-mail.
3. Altere `papel` para `admin` e `ativo` para `true`.
4. Recarregue o app. A partir daí, você aprova os demais usuários em **Usuários**, dentro do próprio app.

## 4. Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "FarmaRotina: primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/farmarotina.git
git push -u origin main
```

1. No GitHub: **Settings → Pages → Source:** `Deploy from a branch` → `main` / `(root)` → Save.
2. Em 1 ou 2 minutos, o app estará em `https://SEU-USUARIO.github.io/farmarotina/`.
3. No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar** `SEU-USUARIO.github.io`.

**Instalar como app:** no celular, abra o link no Chrome e toque em ⋮ → *Adicionar à tela inicial* (no iPhone, use o Safari → Compartilhar → *Adicionar à Tela de Início*). No computador, clique no ícone de instalar na barra de endereço do Chrome ou do Edge.

## Permissões

| Módulo | Quem acessa |
|---|---|
| Clientes | quem tem *clientes*; *saúde* e *atendimento* podem buscar clientes |
| Saúde (aferições + injetáveis) | quem tem *saúde* |
| Temperatura, Atendimento, Anotações, Fornecedores | quem tem o módulo |
| POPs | todos com o módulo leem; só o admin cria e edita |
| Excluir qualquer registro ou anexo | só o admin |
| Usuários | só o admin |

Os perfis "Farmacêutico" e "Atendente" na tela de Usuários são só atalhos que marcam os módulos. Ajuste como preferir.

## Anexos

Para continuar no plano gratuito, os anexos ficam no próprio Firestore. As fotos são **comprimidas automaticamente** (em geral, de 3 a 8 MB para 200 a 600 KB), e PDFs são aceitos até cerca de 650 KB. Se um dia precisar de arquivos maiores, dá para migrar para o Firebase Storage (plano Blaze) alterando só o `js/anexos.js` e os backends.

## Valores de referência

Os alertas de aferição (pressão ≥ 140/90, glicemia de jejum ≥ 100, SpO2 < 95 etc.) e as faixas de temperatura (geladeira de 2 a 8 °C, ambiente de 15 a 30 °C) são referências gerais. **Revise com o farmacêutico responsável** e ajuste em `js/modulos/saude.js` e `js/modulos/temperatura.js`.

## Estrutura

```
index.html, manifest.webmanifest, sw.js   → PWA
css/styles.css                            → visual (claro/escuro, celular/desktop)
js/config.js                              → configuração do Firebase
js/db.js                                  → escolhe backend Firebase ou demonstração
js/backend-firebase.js / backend-demo.js  → acesso aos dados
js/modulos/*.js                           → campos e alertas de cada módulo
js/form.js                                → formulários gerados a partir dos módulos
js/anexos.js, js/export.js                → anexos, CSV e impressão
js/paginas/*.js                           → telas
firestore.rules                           → segurança
```

**Para adicionar um campo**, inclua uma linha em `campos` no arquivo do módulo. **Para criar um módulo novo**, crie o schema, adicione-o em `js/modulos/index.js` e em `js/perm.js` (`MODULOS`) e crie o bloco correspondente no `firestore.rules`.
