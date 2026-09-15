# Então Bora — React Web

Migração React + TypeScript, Vite e Firebase Web. A aplicação está em `react-web/`; o projeto Flutter vizinho foi usado somente como referência de leitura. Nenhum dado ou configuração de produção foi alterado.

## Organização por feature

As rotas importam somente a API pública de cada domínio:

```text
src/features/
  events/
    components/          # EventCard
    data/                # contrato de acesso a eventos
    model/               # tipo e regras do domínio
    pages/               # detalhes e criação/edição
  places/
    components/          # PlaceCard
    data/                # contrato de acesso a estabelecimentos
    model/               # tipos de local e cardápio
    pages/               # detalhes, criação, gestão e cardápio
  management/            # formulário reutilizado pelos dois domínios
  menu-management/       # entrada da gestão de cardápio
  partner-dashboard/     # painel do parceiro
  user-area/             # área pessoal
  entity-detail/         # apresentação compartilhada de detalhes
```

Firebase permanece em `src/core`, e os modelos e elementos visuais realmente compartilhados permanecem em `src/shared`. `npm run check:architecture` impede que features voltem a importar o componente raiz da aplicação.

## Executar

Node 22.13 ou superior. Nesta pasta: `npm install`, copie `.env.example` para `.env.local`, configure o ambiente de homologação e execute `npm run dev`. No PowerShell com scripts desabilitados, use `npm.cmd`. `npm run build` verifica tipos e gera `dist`; `npm test` executa os testes de domínio.

Sem Firebase configurado, a aplicação mostra o estado de agenda não conectada. Não há dados fictícios nem login simulado. Configure domínios autorizados do Firebase Auth e restrições HTTP das chaves Maps.

Para conectar um ambiente, siga o [guia de implementação Firebase](docs/firebase-connection.md). Ele registra a ordem segura para emuladores, homologação e produção, além da matriz de regras, índices e critérios de aceite.

A comparação efetiva com o Flutter e o estado observado do projeto `entaobora` está na [auditoria da conexão de produção](docs/firebase-production-audit.md). O ambiente local opera com escritas de produto bloqueadas enquanto as regras não forem revisadas.

## Comportamentos

- Rotas públicas antigas por ID/slug e alias `/places/:id`; edição por `/events/:id/edit` e `/places/:id/edit`; seleção do cardápio/painel por `?placeId=`.
- Login Google preserva papel, vínculo e preferências. Admin não é parceiro. Contas inativas não escrevem pela interface.
- Bora e check-in leem evento e interação na transação. Check-in aceita início/fim inclusivos, status publicado e distância até 100 m. Cadastro exige término estritamente posterior ao início.
- Sessões e assinaturas têm cleanup. A consulta pública é renovada a cada minuto. ID real do documento é usado nas interações após resolução por slug.
- Slugs publicados são somente leitura na edição. A checagem de colisões antes da escrita não garante unicidade concorrente: será necessário um serviço/reserva de slug para garantia global, considerando os escritores Flutter.
- Leituras aceitam proprietário/criador como string ou mapa. Datas continuam Timestamp no Firestore. Cardápio usa transação e atualiza somente seus arrays. Imagens antigas são renderizadas como Base64 ou URL; novas imagens podem ser informadas por URL.
- Dashboard mantém métricas de todos os eventos do responsável, conforme comportamento legado. Seleção de local determina a área de gestão, sem filtrar métricas.
- Datas exibidas no fuso do dispositivo, como no legado. FCM preserva padding no ID Base64 URL-safe do token.

## Limites e homologação obrigatória

As regras e índices implantados não foram fornecidos. Políticas da interface **não substituem regras Firestore**. Não publicar para usuários reais antes de testar leitura, escrita direta, autoria, vínculo e transferências no backend. Proximidade e horário do check-in são avaliados no cliente e precisam de validação confiável no servidor; isso não constitui prova antifraude.

Ainda dependem de implementação/validação complementar: unicidade concorrente de slugs; autocomplete Places completo; upload/compressão de novas imagens; tratamento explícito de autores órfãos; exclusão e retenção de eventos; comparação visual com Flutter; testes de concorrência e autorização em emuladores; envio FCM ponta a ponta; SSR/pré-renderização e metadados próprios por evento para crawlers.

O worker FCM ? gerado com a mesma configuração do app durante o build. O registro de tokens não garante entrega, e desativar afeta somente o dispositivo atual. Não remover indiscriminadamente workers antigos.

## Publicação e rollback

Servir `dist/` com fallback de todas as rotas de aplicação para `index.html`. Arquivos inexistentes, incluindo worker, devem responder 404. Hospedar primeiro em homologação HTTPS. Preservar artefato Flutter, configuração atual de hosting e backup de dados antes da troca. Reverter o frontend não reverte escritas no banco. A publicação de produção e o ensaio de rollback não foram executados.

Referências: [transações Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions), [FCM Web](https://firebase.google.com/docs/cloud-messaging/js/receive).

## Verifica??o local

Build e 14 testes unit?rios aprovados. Servidor local respondeu HTTP 200. Auditoria de depend?ncias sem vulnerabilidades ap?s atualiza??o. N?o foi feita inspe??o visual em navegador nem execu??o contra Firebase real. WebMCP ? opcional e n?o foi validado em um contexto de navegador compat?vel. Os ?ndices anexos s?o propostas para revis?o, n?o c?pia dos ?ndices implantados.
