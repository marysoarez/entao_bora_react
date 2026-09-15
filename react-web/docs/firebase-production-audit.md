# Auditoria da conexão com o Firebase de produção

Revisão realizada em 10/09/2026 comparando o React Web com o código Flutter e consultando os índices implantados no projeto `entaobora`. Nenhum deploy, migração, exclusão ou escrita no Firebase foi executado durante a auditoria.

## Configuração aplicada

O arquivo local ignorado `.env.local` utiliza a aplicação Web já usada pelo Flutter:

| Variável                            | Valor/origem                                              |
| ----------------------------------- | --------------------------------------------------------- |
| `VITE_FIREBASE_PROJECT_ID`          | `entaobora`                                               |
| `VITE_FIREBASE_AUTH_DOMAIN`         | `entaobora.firebaseapp.com`                               |
| `VITE_FIREBASE_APP_ID`              | aplicação Web `1:325136993258:web:429ca200628b98ad7a8093` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `325136993258`                                            |
| `VITE_FIREBASE_STORAGE_BUCKET`      | `entaobora.firebasestorage.app`                           |
| `VITE_FIREBASE_API_KEY`             | configuração Web presente em `lib/firebase_options.dart`  |
| `VITE_FIREBASE_WRITES_ENABLED`      | `false`                                                   |

`src/core/firebase.ts` recusa inicializar o cliente se `projectId` não for exatamente `entaobora`. O frontend usa apenas os pacotes cliente `firebase/app`, `firebase/auth`, `firebase/firestore` e `firebase/messaging`; não há Admin SDK.

A chave Google Maps Web usada pelo Flutter foi aplicada localmente para permitir o teste do mapa. Suas restrições de referenciador ainda precisam ser confirmadas no Console Google Cloud. Map ID e VAPID não foram preenchidos porque não há valor ativo disponível nos arquivos examinados.

## Modo conservador

Com `VITE_FIREBASE_WRITES_ENABLED=false`, ficam bloqueadas antes de chamar o Firestore:

- criação e edição de evento;
- criação e edição de estabelecimento;
- edição de cardápio;
- Bora e check-in;
- incremento de visualizações e compartilhamentos;
- transferência de evento;
- preferências de localização;
- preferências e tokens de notificação.

O login Google continua autorizado a criar `users/{uid}` no primeiro acesso ou sincronizar os campos básicos do usuário existente, pois isso faz parte da jornada de autenticação solicitada.

Para usuário existente, o React atualiza somente `id`, `name`, `email`, `photoUrl`, `isAnonymous` e `updatedAt`. Não envia `role`, `active`, `partnerId`, preferências ou localização na atualização. Para usuário novo, mantém os mesmos defaults do Flutter: `role: user`, `active: true`, `partnerId: null`, notificações e localização desativadas.

## Operações seguras para o primeiro teste

| Jornada                | Acesso Firestore                                      | Observação                                       |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Inicialização Firebase | nenhum documento                                      | valida se a configuração aponta para `entaobora` |
| Login Google           | Auth + leitura/escrita mínima de `users/{uid}`        | exige domínio autorizado e regras compatíveis    |
| Restaurar sessão       | leitura de `users/{uid}`                              | listener encerrado ao trocar/sair da sessão      |
| Home                   | leitura de `places` e consulta de `events` publicados | usa índice composto já implantado                |
| Detalhes por ID        | leitura direta de `places/{id}` ou `events/{id}`      | incremento de views bloqueado                    |
| Detalhes por slug      | consulta `slug == valor`, limite 1                    | interação usa depois o ID real                   |
| Mapa                   | usa documentos já lidos                               | chave Maps ainda precisa ser configurada         |
| Área pessoal           | collection group de `boras` e `checkins`              | índices de `user.id` já implantados              |

Mesmo essas operações devem começar com uma conta controlada. O login produz uma escrita mínima no perfil; todas as demais jornadas da tabela são de leitura no modo conservador.

## Comparação das escritas React e Flutter

### Eventos

Flutter cria `events/{id}` com ID apenas no caminho e escreve `createdBy` como UID string. Datas são `Timestamp`. O React segue o mesmo caminho, não grava `id` dentro do evento, converte as datas para `Timestamp`, grava `createdBy` como UID string e preserva `createdAt`, status e contadores ao editar.

Riscos antes de habilitar:

- a checagem de slug ocorre antes da transação e não garante unicidade concorrente;
- o React permite carregar evento cujo criador esteja ausente, enquanto o Flutter omite o evento se não encontrar o usuário autor;
- payload completo pode substituir campos adicionados por outro cliente entre leitura e escrita;
- política de quem pode criar evento precisa ser confirmada nas regras.

### Estabelecimentos

Flutter grava o campo `id` também dentro de `places/{placeId}` e grava `ownerId` como UID string. O React foi corrigido para preservar esse campo interno em novas escritas, além do ID do caminho. Na edição, preserva o proprietário e os arrays de cardápio lidos dentro da transação.

Riscos antes de habilitar:

- concorrência entre edição do local e edição do cardápio;
- valores desconhecidos de `type` podem causar erro no Flutter, que usa `PlaceType.values.byName`;
- política para `partnerId` e proprietário precisa ser confirmada no backend.

### Bora

Ambos usam `events/{eventId}/boras/{uid}` e salvam `eventId`, `user` e `createdAt: Timestamp`. O Flutter decide incluir/remover usando o booleano da interface e incrementa `boraCount` com `FieldValue.increment`. O React lê o documento Bora e o evento dentro da transação antes de incluir/remover, mas ainda altera `boraCount` no cliente.

O snapshot React foi ajustado para manter os mesmos campos do `UserSummaryDto`, incluindo `lastKnownLocation` como `GeoPoint` quando existir. Nenhuma collection alternativa foi criada.

### Check-in

Ambos usam `events/{eventId}/checkins/{uid}` e salvam `eventId`, `user`, `checkedInAt: Timestamp`, `latitude` e `longitude`. O Flutter escreve o check-in e incrementa `checkinCount` sem ler a existência dentro da transação. O React lê evento e check-in primeiro, tornando a repetição idempotente, mas horário e distância continuam sendo validados no navegador.

### Perfil e notificações

O login React segue a lista mínima solicitada e nunca envia papel, atividade ou vínculo na atualização de usuário existente. Localização e notificações continuam nos campos usados pelo Flutter, mas estão bloqueadas pelo modo conservador.

O token permanece em `users/{uid}/notification_tokens/{tokenId}`. O ID continua sendo Base64 URL-safe com padding preservado. O documento mantém `token`, `platform`, `isWeb`, `enabled` e `updatedAt`. Flutter e React gravam `platform: web` no navegador. O Flutter acompanha renovação de token; o React ainda não tem fluxo equivalente comprovado.

## Contadores e futura Cloud Function

O React altera contadores em `src/core/repository.ts`:

- `toggleBora`: calcula e atualiza `boraCount` na mesma transação;
- `checkIn`: usa `increment(1)` em `checkinCount`;
- `count`: incrementa `views` ou `shares`.

Todas essas funções estão bloqueadas no modo conservador.

Estratégia futura recomendada:

1. O cliente cria/remove apenas `boras/{uid}` ou cria `checkins/{uid}`.
2. Triggers Firestore atualizam os contadores no evento na criação/exclusão das interações.
3. Check-in passa por Function autenticada que valida evento, horário do servidor, existência prévia e política de localização.
4. Uma rotina administrativa reconcilia o contador com a quantidade real de subdocumentos antes da troca.
5. As regras deixam clientes sem permissão para alterar `boraCount` e `checkinCount`.

Essa mudança não deve ser implementada enquanto o Flutter depender da estratégia atual sem um plano de coexistência.

## Índices atualmente implantados

A consulta somente leitura `firebase firestore:indexes --project entaobora` confirmou todos como `READY`:

1. `events`: `placeId ASC`, `status ASC`, `startDate ASC`, `endDate ASC`, `__name__ ASC`.
2. `events`: `status ASC`, `endDate ASC`, `__name__ ASC`.
3. `boras.user.id`, escopo collection group, ordem ascendente.
4. `checkins.user.id`, escopo collection group, ordem ascendente.

O arquivo local `firestore.indexes.json` foi sincronizado com essa saída para documentar o estado observado. Isso não executou deploy nem modificou índices remotos.

Para o React atual, são necessários o índice 2 para a Home e os índices 3 e 4 para a área pessoal. O índice 1 é usado pelo Flutter para próximos eventos de um estabelecimento e deve ser preservado durante a coexistência. Consultas simples de slug, proprietário e criador usam índices automáticos de campo único. Nenhum índice novo foi solicitado ou implantado.

## Pontos das regras que precisam ser revisados

As regras implantadas não estavam no repositório e não foram alteradas. Precisamos obter e revisar a versão ativa antes de habilitar qualquer escrita de produto:

- leitura pública de `places` e eventos publicados;
- leitura do próprio `users/{uid}`;
- criação inicial do próprio usuário com `role: user`;
- atualização somente dos campos básicos permitidos no login;
- bloqueio de alterações cliente em `role`, `active` e `partnerId`;
- autorização de autor/proprietário nos dois formatos legados;
- validação dos formatos de `Timestamp`, endereço, arrays e snapshots;
- criação/remoção apenas do próprio Bora;
- criação única do próprio check-in;
- proteção de `boraCount`, `checkinCount`, `views` e `shares`;
- acesso a collection group limitado ao próprio `user.id`;
- escrita do token somente dentro do próprio usuário;
- política explícita para transferência de evento;
- comportamento de admin e conta inativa.

## Próxima validação

Sem habilitar escritas de produto:

1. confirmar que `localhost` está nos domínios autorizados do Auth;
2. iniciar `npm run dev` com `.env.local`;
3. validar locais e eventos públicos;
4. abrir local e evento por ID e por slug;
5. fazer login com uma conta de teste já existente;
6. verificar a área pessoal e as consultas collection group;
7. configurar a chave Maps restrita ao host local e validar o mapa;
8. registrar erros de permissão sem modificar regras.

Somente depois dessa rodada e da revisão das regras deve-se considerar `VITE_FIREBASE_WRITES_ENABLED=true` em um ambiente controlado.

## Resultado da validação somente leitura

Uma verificação direta com o Firebase Client SDK e sem usuário autenticado confirmou:

- projeto inicializado: `entaobora`;
- leitura pública de `places`: funcionando, com 2 documentos no momento do teste;
- consulta de eventos publicados e futuros: funcionando, com 12 documentos no momento do teste;
- detalhes de local e evento por ID: funcionando;
- resolução de local e evento por slug: funcionando;
- dados observados: 44 eventos com `createdBy` string e 2 locais com `ownerId` string; nenhum mapa legado apareceu na amostra atual, mas o parser compatível foi mantido.

A consulta collection group de `boras` sem autenticação não foi negada quando filtrada por um `user.id` inexistente. Ela retornou vazia, sem expor documentos no teste, mas a autorização da consulta anônima é um sinal que precisa ser investigado nas regras implantadas. Não faremos consultas usando IDs reais de usuários até revisar essas regras.

Login, leitura do perfil autenticado, área pessoal com dados reais e renderização do mapa continuam como testes manuais, pois dependem de uma conta controlada, popup do navegador e domínios autorizados.
