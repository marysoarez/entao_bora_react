# Conexão Firebase — guia de implementação

Este documento descreve como conectar o React Web ao Firebase com segurança e sem alterar os dados usados pelo Flutter antes da homologação. Ele foi revisado em 10/09/2026 contra o código atual da aplicação React e a configuração disponível no projeto Flutter.

## 1. Estado atual

O React já utiliza o SDK modular do Firebase e possui adaptadores para:

- Firebase Authentication com login Google por popup;
- Cloud Firestore para usuários, estabelecimentos, eventos, Boras, check-ins e tokens;
- Cloud Messaging para obtenção do token web e recebimento em primeiro plano;
- geração de `firebase-messaging-sw.js` durante o build;
- configuração de Hosting com fallback para a SPA;
- Google Maps e Places usando chave separada.

A aplicação só inicializa o Firebase quando `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID` e `VITE_FIREBASE_APP_ID` estão preenchidos. Sem essas variáveis, ela continua funcionando no estado visual “agenda não conectada”.

Ainda não estão prontos para produção:

- regras Firestore versionadas e testadas;
- inventário dos índices que já estão implantados;
- conexão do React com os emuladores locais;
- separação confirmada entre homologação e produção;
- validação confiável, no backend, de horário e distância do check-in;
- garantia concorrente de unicidade de slug;
- emissor de mensagens FCM e teste ponta a ponta;
- credenciais Firebase configuradas no provedor que hospedará o React.

## 2. Escolha dos ambientes

Para uma migração comum, a recomendação continua sendo usar projetos independentes. Nesta execução, foi autorizado conectar o React ao projeto existente `entaobora` em modo conservador, com escritas de produto bloqueadas. A tabela abaixo permanece como referência para testes posteriores:

| Ambiente    | Finalidade                                       | Dados permitidos                   |
| ----------- | ------------------------------------------------ | ---------------------------------- |
| Emuladores  | testes automatizados e desenvolvimento de regras | dados descartáveis                 |
| Homologação | login, mapa, FCM e jornadas manuais              | cópia sanitizada ou dados de teste |
| Produção    | domínio público após aceite e rollback ensaiado  | dados reais                        |

O projeto Flutter observado aponta para `entaobora`. Trate-o como produção até que o responsável pela infraestrutura confirme o contrário. Não copie dados reais para homologação sem sanitização e autorização.

Crie ou identifique primeiro o projeto de homologação. Registre nele uma aplicação Web exclusiva para o React. A configuração da aplicação Web é obtida no Console Firebase em **Configurações do projeto → Seus aplicativos**.

## 3. Variáveis do React

Copie `.env.example` para `.env.local` e preencha com a aplicação Web de homologação:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_MAP_ID=
VITE_FCM_WEB_VAPID_KEY=
VITE_PUBLIC_BASE_URL=http://localhost:5173
```

Regras para essas variáveis:

- não versionar `.env.local`;
- usar uma configuração Firebase Web, nunca credenciais Admin SDK;
- manter chaves diferentes por ambiente sempre que possível;
- definir `VITE_PUBLIC_BASE_URL` com a origem exata do ambiente, sem barra final;
- não adicionar `measurementId` enquanto Analytics não for inicializado no código;
- não colocar conta de serviço, chave privada ou segredo administrativo em variável `VITE_*`, pois tudo com esse prefixo pode chegar ao navegador.

A configuração Web do Firebase identifica o projeto, mas não substitui regras de segurança. As regras Firestore e as restrições das chaves são a barreira de autorização.

## 4. Authentication

No Console Firebase do ambiente escolhido:

1. Ative **Authentication → Sign-in method → Google**.
2. Configure o e-mail de suporte do projeto.
3. Em **Settings → Authorized domains**, adicione:
   - `localhost` para desenvolvimento;
   - o domínio de homologação;
   - `entaobora.com.br` e seus hosts efetivamente usados somente na preparação de produção;
   - o domínio da prévia privada apenas se ela for usada para testar login.
4. Confirme a política para popup bloqueado e dispositivos móveis. O código atual usa `signInWithPopup`; decidir por redirect no mobile exige uma alteração específica.

No primeiro login, o React cria `users/{uid}` com papel `user`. Nos próximos logins, atualiza somente `id`, nome, e-mail, foto e anonimato, preservando papel, vínculo, atividade e preferências. Nunca permita que o cliente escolha ou altere `role`, `active` ou `partnerId` nas regras.

## 5. Estrutura Firestore consumida

```text
users/{uid}
  notification_tokens/{base64UrlDoToken}
places/{placeId}
events/{eventId}
  boras/{uid}
  checkins/{uid}
```

As leituras precisam continuar aceitando os formatos legados:

- `events.createdBy`: UID string ou mapa com `id`;
- `places.ownerId`: UID string ou mapa com `id`;
- imagens: URL, Data URL ou Base64 legado;
- datas persistidas: `Timestamp`;
- coordenadas de endereço: números em `address.latitude` e `address.longitude`;
- preferências de localização: `GeoPoint` em `users.lastKnownLocation`.

Depois de resolver uma URL por slug, toda interação usa o ID real do documento retornado.

## 6. Matriz mínima das regras Firestore

As regras implantadas não estão neste repositório. Antes de escrever um novo `firestore.rules`, exporte ou copie a versão ativa, registre sua origem e revise cada permissão. Publicar um arquivo local sobrescreve as regras mantidas no Console.

| Caminho/operação             | Política esperada                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `users/{uid}` leitura        | próprio usuário; acesso administrativo somente se definido                                 |
| `users/{uid}` criação        | usuário autenticado e `request.auth.uid == uid`; papel inicial `user`                      |
| `users/{uid}` atualização    | próprio usuário, sem alterar papel, atividade, vínculo ou UID                              |
| `places/*` leitura           | pública, se essa for a política confirmada do produto                                      |
| `places/*` criação           | parceiro ativo; `ownerId` autorizado                                                       |
| `places/*` atualização       | proprietário ou parceiro vinculado; campos sensíveis protegidos                            |
| `events/*` leitura           | eventos públicos conforme status; autores podem ler itens gerenciáveis se necessário       |
| `events/*` criação           | usuário autenticado; `createdBy` deve representar o autor autorizado                       |
| `events/*` atualização       | autor/proprietário autorizado; contadores e autoria não podem ser livremente alterados     |
| `events/{id}/boras/{uid}`    | somente `uid`; documento corresponde ao evento e usuário autenticado                       |
| `events/{id}/checkins/{uid}` | somente `uid`; criação única; validação confiável de período e proximidade fora do cliente |
| `notification_tokens/*`      | somente o dono do documento pai; campos e tamanho validados                                |
| consultas global             | negar por padrão qualquer caminho/operação não listado                                     |

Há um conflito importante: o cliente atual atualiza contadores no documento do evento dentro das transações de Bora e check-in. As regras precisam permitir apenas a variação esperada e impedir mudanças em outros campos. Para proteção contra adulteração e fraude, prefira mover os contadores e a decisão final do check-in para backend confiável, como Cloud Functions ou outro serviço autenticado.

Transferir um evento altera `createdBy`. Essa operação não deve ser autorizada apenas porque o cliente exibe um botão; ela precisa de uma política administrativa explícita no backend.

## 7. Índices

Em 10/09/2026, os índices ativos foram consultados em modo somente leitura e o arquivo `firestore.indexes.json` foi sincronizado com o inventário retornado. Nenhum índice remoto foi criado, alterado ou removido.

Inventário recomendado:

```powershell
firebase firestore:indexes --project ID_DO_PROJETO
```

Consultas que precisam ser validadas no ambiente:

| Jornada      | Consulta                                                                         |
| ------------ | -------------------------------------------------------------------------------- |
| Home         | `events`: `status == published`, `endDate >= agora`, ordenação por `endDate`     |
| Slugs        | `events`/`places`: `slug == valor`, limite 1                                     |
| Gestão       | `createdBy == uid`, `createdBy.id == uid`, `ownerId == uid`, `ownerId.id == uid` |
| Área pessoal | collection group `boras` e `checkins`, `user.id == uid`                          |

O índice composto da Home e os `fieldOverrides` de collection group para `user.id` estão implantados com estado `READY`. O índice composto de eventos por estabelecimento usado pelo Flutter também foi preservado no arquivo local.

Depois da revisão, associe regras e índices no `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

## 8. Emuladores e testes de regras

Implemente uma chave explícita, por exemplo `VITE_USE_FIREBASE_EMULATORS=true`, e conecte Auth e Firestore apenas no desenvolvimento. A conexão deve ocorrer uma única vez após a inicialização:

```ts
connectAuthEmulator(auth, "http://127.0.0.1:9099");
connectFirestoreEmulator(db, "127.0.0.1", 8080);
```

Adicione ao `firebase.json`:

```json
{
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

Use `@firebase/rules-unit-testing` para validar, no mínimo:

- visitante lendo conteúdo público;
- visitante tentando qualquer escrita;
- usuário criando e atualizando somente o próprio perfil;
- tentativa de elevar `role`, reativar `active` ou trocar `partnerId`;
- usuário, parceiro proprietário, parceiro vinculado, parceiro sem vínculo, admin e inativo;
- Bora repetido e simultâneo;
- check-in repetido e escrita direta tentando falsificar contagem;
- alteração direta de `createdBy`, `ownerId`, contadores e snapshots de usuário;
- transferência autorizada e não autorizada;
- leitura de atividade pessoal por outro usuário.

O emulador deve carregar as regras pelo `firebase.json`. Sem o caminho de regras configurado, ele pode iniciar com acesso aberto e produzir uma falsa sensação de segurança.

## 9. Google Maps e Places

Use uma chave Web separada do Firebase e restrinja-a por referenciador HTTP aos hosts de desenvolvimento, homologação e produção. Habilite somente as APIs consumidas: Maps JavaScript, Places e, se mantidos os fluxos correspondentes, Geocoding.

O autocomplete deve usar um token novo por sessão de digitação e encerrar a sessão ao buscar os campos do endereço selecionado. Valide endereço vazio, cancelamento, erro de quota e preservação de número/complemento.

## 10. Cloud Messaging

No Console Firebase:

1. Abra **Cloud Messaging → Web configuration**.
2. Crie ou recupere o par de chaves Web Push.
3. Preencha `VITE_FCM_WEB_VAPID_KEY` somente no ambiente correspondente.
4. Confirme HTTPS, suporte do navegador e acesso a `/firebase-messaging-sw.js`.

O build gera o worker com a mesma configuração Firebase da aplicação. O registro atual grava o token em `users/{uid}/notification_tokens/{id}`. Desativar notificações afeta o token corrente, não todos os dispositivos.

Teste separadamente:

- permissão concedida, negada e já bloqueada;
- geração e renovação do token;
- mensagem com a aba aberta;
- mensagem em segundo plano;
- clique da notificação e URL de destino;
- emissor autorizado enviando para homologação;
- remoção ou desativação de tokens inválidos no backend.

## 11. Ordem segura de implantação

1. Criar/confirmar o projeto Firebase de homologação e registrar a aplicação Web React.
2. Inventariar regras, índices, funções, extensões, App Check, domínios Auth e chaves do projeto atual.
3. Versionar regras e índices revisados sem implantá-los em produção.
4. Implementar a seleção de emuladores e os testes automatizados das regras.
5. Configurar `.env.local` com homologação e executar as jornadas manuais.
6. Configurar variáveis no provedor de hospedagem de homologação e gerar um novo build; variáveis `VITE_*` são incorporadas no build.
7. Validar deep links, login, consultas, mapa, FCM e troca de sessão.
8. Repetir os testes contra homologação com dados sanitizados e conferir logs/uso.
9. Fazer backup, preservar o artefato Flutter e ensaiar rollback.
10. Somente após aceite, configurar produção e implantar regras, índices e frontend em uma janela controlada.

Para implantações Firebase CLI, sempre informe o projeto explicitamente:

```powershell
npm run build
firebase deploy --only firestore --project ID_HOMOLOGACAO
firebase hosting:channel:deploy react-migration --project ID_HOMOLOGACAO
```

Evite `firebase deploy` sem `--only` durante a migração, pois ele pode publicar recursos fora do escopo pretendido.

## 12. Critérios de aceite da conexão

A conexão está pronta para homologação quando:

- o cabeçalho da aplicação indica o projeto esperado e nenhum dado de produção foi usado;
- login Google cria e restaura o perfil sem alterar papel e preferências;
- ID e slug abrem locais e eventos e mantêm o ID real nas interações;
- as consultas da Home e da área pessoal funcionam com os índices versionados;
- regras negam todas as escritas não autorizadas da matriz;
- Bora e check-in são idempotentes sob repetição e concorrência;
- mapa, autocomplete e geolocalização tratam permissão e falha;
- FCM funciona em primeiro e segundo plano com emissor de teste;
- troca de usuário encerra listeners e não mostra dados da sessão anterior;
- build de homologação foi gerado com as variáveis corretas;
- rollback do frontend foi executado sem presumir reversão de dados.

A conexão está pronta para produção somente após esses critérios, auditoria das regras implantadas e validação do backend responsável por check-in, transferência e contadores.

## Referências oficiais

- [Adicionar Firebase a um projeto JavaScript](https://firebase.google.com/docs/web/setup)
- [Login Google no Firebase Auth Web](https://firebase.google.com/docs/auth/web/google-signin)
- [Regras de segurança do Cloud Firestore](https://firebase.google.com/docs/firestore/security/get-started)
- [Testar regras com o Emulator Suite](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Índices do Cloud Firestore](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firebase CLI e implantações parciais](https://firebase.google.com/docs/cli)
- [Receber mensagens FCM na Web](https://firebase.google.com/docs/cloud-messaging/web/receive-messages)
