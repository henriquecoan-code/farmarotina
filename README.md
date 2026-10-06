# FarmaRotina

App web (PWA) da **Farmácia São Benedito** para registrar rotinas, atendimentos e POPs. Funciona no computador e no celular, com várias pessoas usando ao mesmo tempo, e pode ser instalado como aplicativo.

Tecnologias: HTML, CSS e JavaScript puros (sem build), Firebase Auth + Firestore (plano gratuito Spark) e hospedagem no GitHub Pages.

## O que o app faz

### Tela inicial
- **Avisos**, por exemplo a temperatura do turno que ainda não foi registrada. O aviso já abre o local que falta.
- **Resumo em números:**
  - última temperatura da geladeira e do ambiente;
  - aferições do dia;
  - aplicações agendadas;
  - atendimentos abertos;
  - trocas pendentes;
  - lembretes.
- **Atalhos** para os registros mais usados.
- **Agenda:** junta, em ordem de data, tudo que tem prazo (atrasados, hoje e próximos 7 dias):
  - aplicações de injetáveis agendadas;
  - lembretes de anotações;
  - retornos de atendimento;
  - trocas com outras farmácias;
  - rotinas (mensais, semanais etc.).

  O cartão fica **amarelo no dia** e **vermelho quando atrasado**. Cada um tem botões rápidos: avisar pelo WhatsApp, registrar, marcar como resolvido ou concluir.
- **Últimos registros.**

### Saúde
- **Aferições:** pressão, glicemia e oximetria, com alerta para valores alterados.
- **Injetáveis:**
  - **Campos:** medicamento, via, local, lote, validade, receita e prescritor. Só o cliente é obrigatório; lote, validade e receita aparecem como *Recomendado (RDC 44/2009)*.
  - **Aplicações recorrentes:**
    - **Repetir:** dose única, a cada 2 dias, semanal, quinzenal, mensal ou outro intervalo.
    - **Controle das doses:** "dose nº X de Y", com a próxima data calculada sozinha.
    - **Seção Agendadas** no topo da lista, da mais próxima para a mais distante, com as mesmas cores da Agenda.
    - **Botão WhatsApp** com a mensagem pronta para avisar o cliente. Muda conforme faltam alguns dias, é o dia ou está atrasado, e não cita o nome do medicamento.
    - **Botão Registrar:** registra a aplicação de hoje direto, sem abrir formulário (só pede confirmação). Copia os dados, avança a dose, agenda a próxima data e dá baixa no agendamento anterior. Também é possível **encerrar o agendamento**, quando o cliente desiste.

### Temperatura
- **Um registro por turno com geladeira e ambiente juntos** (atual, mínima e máxima de cada um, e umidade), com alerta fora da faixa. O campo de ação corretiva aparece e se torna obrigatório quando algum valor sai da faixa.
- **Lista em mini tabelas por dia:** uma linha por turno, com as colunas Geladeira, Ambiente e Umidade. Valores fora da faixa ficam em vermelho.
- Registros antigos, feitos com geladeira e ambiente separados, continuam aparecendo e são juntados na mesma linha do turno.

### Trocas entre farmácias
- **Quatro botões coloridos**, um para cada tipo: 🔵 *Peguei emprestado*, 🟠 *Emprestei*, 🟣 *Repassei (vencendo)* e 🟢 *Recebi (vencendo)*. A troca abre com o tipo já escolhido, e a lista mostra uma etiqueta da mesma cor.
- **Campos:** só a farmácia e o produto são obrigatórios. Há também contato, telefone, quantidade, lote, validade, prazo e forma de acerto.
- **Empréstimo:** o prazo de devolução vem preenchido para o dia seguinte.
- **Botão Concluir** em cada troca pendente (na lista, na página da troca e na Agenda), que registra a data e a hora da conclusão.
- **WhatsApp para a farmácia parceira**, com mensagem pronta conforme o tipo da troca.
- **Farmácias parceiras** (botão dentro de Trocas):
  - **Cadastro:** nome, contato, telefone e endereço.
  - **Preenchimento automático:** ao escolher a farmácia na troca, o contato e o telefone se preenchem sozinhos.
  - **Cadastro rápido:** dá para cadastrar uma farmácia nova sem sair da troca.
  - **Página de cada farmácia:** mostra o histórico de trocas com ela.

### Cadastros e rotinas
- **Clientes:** cadastro com consentimento LGPD e histórico completo (aferições, aplicações e atendimentos).
- **Atendimento:** dúvidas, encomendas e reclamações, com data de retorno e aviso pelo WhatsApp.
- **Anotações gerais:** categoria e **lembrete com data**, que aparece na Agenda até ser marcado como resolvido.
- **Fornecedores:** **horário limite para envio do pedido** (a lista mostra "Pedido até 14:00" ou "Encerrado") e prazo padrão de entrega.
- **POPs:** todos com acesso leem; só o administrador edita.
- **Rotinas:** tarefas que se repetem, como "todo começo de mês enviar o relatório CST e exportar o XML para a contabilidade" ou "atualizar estoque mínimo e demanda por curva ABC".
  - **Repetição:** mensal (dia do mês), semanal (dia da semana), quinzenal, diária, anual ou a cada X dias. A próxima data é calculada sozinha.
  - **Botão Feito** (na lista, na página da rotina e na Agenda): registra quem fez e quando e já calcula a próxima vez. Feita com atraso, vai para o próximo ciclo; feita adiantada, não repete o mesmo ciclo.
  - **Página da rotina:** mostra o histórico das últimas vezes em que foi feita.
  - **Pausar:** desmarque "Rotina ativa" para pausar sem apagar.

### Em todos os módulos
- **Anexos com anotações** (foto pela câmera ou arquivo), comprimidos automaticamente.
- **Busca, filtro por período, "só alertas"**, **exportação CSV** (abre no Excel) e **impressão**, por exemplo a planilha mensal de temperatura.
- **Offline:** o que for registrado sem internet sincroniza quando a conexão volta.
- **Tema claro e escuro**, com layout próprio para celular (barra de atalhos embaixo) e para computador (menu lateral).

### Configurações (cada usuário a sua)
- **Menu lateral do jeito de cada um:**
  - No computador, o botão de ajustes **Organizar o menu** (ao lado do nome do app) permite arrastar os itens e esconder com o olho.
  - No celular, use **Configurações**, com arrastar ou setas ↑↓.
  - Esconder um item só tira do menu; o acesso continua.
- **Barra de atalhos do celular:** escolha os 3 botões de baixo.
- **Atalhos da tela inicial:** escolha quais botões de "Novo…" aparecem.
- **Restaurar padrão** desfaz tudo.
- As preferências ficam salvas na conta da pessoa (vale no celular e no computador). Módulos liberados depois aparecem sozinhos no fim do menu.

### Usuários e permissões
- **Novos cadastros** chegam como pendentes. O admin libera o acesso e marca os módulos de cada pessoa, com os atalhos de perfil *Farmacêutico* e *Atendente*.
- **Administrador** tem acesso a todos os módulos, inclusive os criados depois, sem precisar marcar nada.
- **Editar** nome e e-mail de contato. O e-mail de login só a própria pessoa troca.
- **Excluir usuário:**
  - A pessoa perde o acesso na hora e vê a tela "Acesso removido".
  - Os registros que ela fez são mantidos.
  - Quem foi removido fica numa lista própria e pode ser **restaurado**.
  - A conta de login continua no Firebase. Para apagá-la de vez, use *Authentication → Usuários* no console.

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

> ⚠️ **Sempre que o `firestore.rules` mudar** (por exemplo, quando um módulo novo é criado), publique-o de novo no console. Sem isso, o Firebase recusa as gravações do módulo novo, até para o administrador, e o app mostra um aviso pedindo para conferir as regras.

## 3. Criar o primeiro administrador

1. Abra o app, vá em **Criar conta** e cadastre-se. Você vai ver a tela "Aguardando aprovação".
2. No console: **Firestore → Dados → `usuarios` →** o documento com o seu e-mail.
3. Altere `papel` para `admin` e `ativo` para `true`.
4. Recarregue o app. A partir daí, você aprova os demais usuários em **Usuários**, dentro do próprio app.

## 4. Publicar no GitHub Pages

O repositório é `henriquecoan-code/farmarotina`. Para publicar uma atualização:

```bash
git add .
git commit -m "descrição da mudança"
git push
```

Na primeira vez: no GitHub, abra **Settings → Pages → Source:** `Deploy from a branch` → `main` / `(root)` → Save. Depois, no Firebase, vá em **Authentication → Configurações → Domínios autorizados → Adicionar** o domínio `henriquecoan-code.github.io`.

Depois de cada push, o site atualiza em 1 ou 2 minutos. O app confere se há versão nova ao abrir, então a equipe recebe a atualização sem precisar limpar o cache.

**Instalar como app:** no celular, abra o link no Chrome e toque em ⋮ → *Adicionar à tela inicial* (no iPhone, use o Safari → Compartilhar → *Adicionar à Tela de Início*). No computador, clique no ícone de instalar na barra de endereço do Chrome ou do Edge.

## Configurações rápidas

| O quê | Onde |
|---|---|
| Nome da farmácia nas mensagens de WhatsApp | `NOME_FARMACIA` em [`js/config.js`](js/config.js) |
| Faixas de temperatura e umidade | `FAIXAS` e `UMIDADE_MAX` em [`js/modulos/temperatura.js`](js/modulos/temperatura.js) |
| Alertas de pressão, glicemia e SpO2 | [`js/modulos/saude.js`](js/modulos/saude.js) |
| Intervalos de repetição das aplicações | `INTERVALOS` em [`js/modulos/saude.js`](js/modulos/saude.js) |
| Textos das mensagens de WhatsApp | [`js/agenda.js`](js/agenda.js) (clientes) e [`js/modulos/trocas.js`](js/modulos/trocas.js) (farmácias) |
| Dias mostrados na Agenda da tela inicial | `DIAS_AGENDA` em [`js/paginas/inicio.js`](js/paginas/inicio.js) |

## Permissões

| Módulo | Quem acessa |
|---|---|
| Clientes | quem tem *clientes*; *saúde* e *atendimento* podem buscar clientes |
| Saúde (aferições + injetáveis) | quem tem *saúde* |
| Temperatura, Atendimento, Anotações, Fornecedores | quem tem o módulo |
| Trocas e Farmácias parceiras | quem tem *trocas* |
| Rotinas | quem tem *rotinas* (não vem no perfil Atendente) |
| POPs | todos com o módulo leem; só o admin cria e edita |
| Excluir qualquer registro ou anexo | só o admin |
| Usuários | só o admin |
| Configurações (preferências do próprio menu) | cada usuário ativo, só as suas |

Os perfis "Farmacêutico" e "Atendente" na tela de Usuários são só atalhos que marcam os módulos. Ajuste como preferir. Usuários antigos não ganham módulos novos automaticamente: marque-os na tela de Usuários.

## Anexos

Para continuar no plano gratuito, os anexos ficam no próprio Firestore. As fotos são **comprimidas automaticamente** (em geral, de 3 a 8 MB para 200 a 600 KB), e PDFs são aceitos até cerca de 650 KB. Se um dia precisar de arquivos maiores, dá para migrar para o Firebase Storage (plano Blaze) alterando só o `js/anexos.js` e os backends.

## Valores de referência e legislação

- **Alertas:** os alertas de aferição (pressão ≥ 140/90, glicemia de jejum ≥ 100, SpO2 < 95 etc.) e as faixas de temperatura (geladeira de 2 a 8 °C, ambiente de 15 a 30 °C) são referências gerais. **Revise com o farmacêutico responsável.**
- **Injetáveis:** a RDC 44/2009 da Anvisa exige o registro do serviço farmacêutico e a receita para medicamentos sob prescrição. Por isso o app marca lote, validade e receita como recomendados. Confirme as exigências com a vigilância sanitária local.

## Estrutura

```
index.html, manifest.webmanifest, sw.js   → PWA (o sw.js sempre busca a versão nova)
css/styles.css                            → visual (claro/escuro, celular/desktop)
js/config.js                              → Firebase e nome da farmácia
js/db.js                                  → escolhe backend Firebase ou demonstração
js/backend-firebase.js / backend-demo.js  → acesso aos dados
js/modulos/*.js                           → campos, alertas e comportamento de cada módulo
js/form.js                                → formulários gerados a partir dos módulos
js/agenda.js                              → agenda, cores de prazo e mensagens de WhatsApp
js/anexos.js, js/export.js                → anexos, CSV e impressão
js/paginas/*.js                           → telas
firestore.rules                           → segurança
```

**Para adicionar um campo**, inclua uma linha em `campos` no arquivo do módulo. **Para criar um módulo novo**, crie o schema, adicione-o em `js/modulos/index.js` e em `js/perm.js` (`MODULOS`) e crie o bloco correspondente no `firestore.rules`.

Opções que um módulo pode usar (veja os exemplos em `js/modulos/`):

| Opção | Para quê | Exemplo |
|---|---|---|
| `obrig`, `se`, `padrao`, `ajuda`, `lg` | campo obrigatório, condicional, valor inicial, dica e largura | todos |
| `lista: true` | mostra as opções como lista suspensa | tipo da troca |
| `tipo: 'ref'` + `preencher` | busca em outro cadastro e copia dados dele | cliente, farmácia parceira |
| `tipo: 'secao'`, `rotLongo` | título separando grupos de campos; rótulo completo no detalhe e no CSV | temperatura |
| `normalizar`, `renderLista` | converte registros antigos; desenha a lista do seu jeito | temperatura |
| `detalheExtra` | conteúdo extra na página do registro | histórico da rotina |
| `calcular` | campos preenchidos sozinhos (até o usuário alterar) | próxima aplicação, prazo |
| `agenda` | seção de agendadas na lista | injetáveis |
| `aposCriar` | depois de salvar, abre outra tela (devolve `{ hash, msg }`) | — |
| `novos` | vários botões coloridos de "novo" | trocas |
| `etiqueta` | etiqueta colorida na linha da lista | tipo da troca |
| `acaoRapida` | botão de ação direto na lista, no registro e na Agenda | concluir troca, resolver lembrete, rotina feita |
| `links`, `menu: false`, `voltar` | botões extras e telas fora do menu lateral | farmácias parceiras |

## Histórico de mudanças

- **Primeira versão:**
  - módulos de saúde, temperatura, clientes, atendimento, notas, fornecedores e POPs;
  - anexos com compressão;
  - permissões por módulo;
  - modo offline;
  - exportação CSV e impressão.
- **Notas → Anotações gerais**, com categoria e lembrete.
- **Fornecedores:** horário limite do pedido e prazo de entrega.
- **Injetáveis:**
  - só o cliente obrigatório;
  - aplicações recorrentes com seção Agendadas;
  - WhatsApp com mensagens prontas;
  - botão Registrar próxima dose.
- **Mensagens:** com o nome da Farmácia São Benedito e sem o nome do medicamento.
- **Usuários:** editar nome e e-mail, excluir e restaurar.
- **Correção de cache:** o app sempre carrega a versão mais nova depois de uma atualização.
- **Agenda na tela inicial** com tudo que tem prazo.
- **Temperatura:** registro em sequência da geladeira e do ambiente.
- **Novo módulo Trocas entre farmácias**, com cadastro de farmácias parceiras.
- **Trocas:**
  - quatro botões coloridos por tipo;
  - só farmácia e produto obrigatórios;
  - botão Concluir com data e hora da conclusão.
- **Tela de Usuários:** deixa claro que o administrador tem acesso total.
- **Erro de permissão:** a mensagem orienta o admin a publicar as regras do Firebase.
- **Temperatura:** geladeira e ambiente num registro só, com lista em mini tabelas por dia.
- **Agendadas:** o botão Registrar dá baixa na aplicação direto, sem abrir o formulário.
- **Novo módulo Rotinas**, com botão Feito, histórico e as rotinas na Agenda.
- **Anotações:** botão Resolvido também na lista de anotações.
- **Configurações:** menu lateral personalizável por usuário (arrastar no computador; tela de Configurações no celular), barra do celular e atalhos da tela inicial.
