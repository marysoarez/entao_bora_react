# Guia interno de documentação e demonstração

Base: leitura do código React em 30/09/2026. Este guia acompanha a apresentação comercial e não deve integrar o PDF destinado ao cliente.

## Entregáveis e uso

- `apresentacao-comercial.md`: texto editável da apresentação, incluindo gestão e experiência do usuário.
- `apresentacao-comercial.html`: versão diagramada para abrir no navegador e imprimir em A4 como PDF.
- `gerar-apresentacao.mjs`: gera o HTML a partir do Markdown, sem dependências externas.

Para atualizar, edite o Markdown e execute `node documentacao/gerar-apresentacao.mjs` dentro de `react-web`. Abra o HTML, use Ctrl+P, selecione Salvar como PDF, papel A4, escala 100%, desative cabeçalhos/rodapés do navegador e habilite gráficos de fundo. Confira a prévia antes de exportar.

## Escopo da verificação

A documentação descreve interfaces e regras presentes no repositório. Não houve autenticação, escrita em dados reais, teste de produção ou comprovação de entrega de notificações. Implementação no código não comprova implantação e homologação. O README contém observações históricas que diferem de implementações mais recentes; o código das telas atuais foi usado como referência principal.

## Inventário funcional e rastreabilidade

Todos os caminhos abaixo são relativos a `react-web/src`.

| Área | Referência principal | Detalhes para demonstração |
| --- | --- | --- |
| Painel | `features/partner-dashboard/PartnerDashboardPage.tsx` | Seleção do local, métricas dos eventos exibidos, atalhos, eventos, equipe e módulos. |
| Operação ao vivo | `features/partner-dashboard/OperationalDashboard.tsx` | Mesas, atendimentos abertos, pessoas, duração, consumo e até 12 pedidos ativos no resumo; lista completa na gestão. |
| Cadastro e eventos | `features/management/ManagementModule.tsx` | Dados do local, horários, contatos, gêneros, programação, atrações e ingresso externo. |
| Página pública | `features/entity-detail/EntityDetails.tsx` | Fotos, informações, cardápio, agenda, compartilhamento e rota no Maps. |
| Mesas | `features/tables/pages/TablesManagementPage.tsx` | Número, nome, capacidade, ativação e histórico. |
| Atendimentos | `features/service-sessions/pages/ServiceSessionsPage.tsx` | Mesa, balcão, salão e retirada; abertura, consulta, encerramento e cancelamento. |
| Participantes | `features/service-sessions/model/serviceParticipant.ts` e `features/qr/data/qrContextRepository.ts` | Vínculo de usuário à jornada; não apresentar divisão de conta por pessoa como recurso existente. |
| Cardápio | `features/menu-management/MenuEditor.tsx` e `PublicMenu.tsx` | Categorias, produtos, ordem, ativação, preço, imagem e disponibilidade; migração do cardápio legado quando aplicável. |
| Pedidos | `features/orders/OrdersPanel.tsx` e `model/order.ts` | Itens com cópia de nome/preço, observações, total e seis situações; limite atual de cinco itens distintos por pedido. |
| Conta | `features/service-sessions/SessionAccount.tsx` | Total sem cancelados, detalhamento de itens e revisão antes de encerrar. |
| Histórico | `features/service-sessions/HistorySummary.tsx` e `pages/TableHistory.tsx` | Período, atendimentos encerrados, visitas, ticket, duração, consumo, mesas, tipos e dias. |
| QR Code | `features/qr/QrManagementPanel.tsx`, `QrCodeCard.tsx` e `pages/QrCheckInPage.tsx` | PNG geral e por mesa; check-in, início voluntário de consumo e pedidos próprios. |
| Estoque | `features/inventory/InventoryPage.tsx` | Insumos em un/g/ml, saldo, mínimo, movimentações com motivo, autor e data; receitas com até cinco insumos. |
| Compras | `features/purchases/PurchasesPage.tsx` e `data/purchasesRepository.ts` | Fornecedor, necessidade de reposição, até cinco insumos distintos por compra, custo e recebimento total com entrada no estoque. |
| Equipe | `features/partner-dashboard/PlaceMembers.tsx` e `shared/partnerPermissions.ts` | Usuário existente informado pelo ID; proprietário, gerente e funcionário; vínculo ativo/inativo por local. |
| Módulos e acesso comercial | `shared/placeModules.ts`, `shared/placeEntitlements.ts` e `shared/commercialPlans.ts` | Catálogo, habilitação, permissões comerciais e capacidades de planos; não definem tabela de preços ou cobrança automática. |
| Campanhas | `features/notifications/NotificationsPage.tsx` | Criação, consulta e cancelamento de rascunhos; envio ainda depende de serviço complementar. |
| Descoberta | `app/App.tsx` e `features/MapView.tsx` | Busca por texto, gênero, eventos gratuitos, lista, mapa e localização. |
| Área pessoal | `features/management/ManagementModule.tsx`, função `UserArea` | Perfil, até cinco eventos de atividade, localização, dispositivo e preferências de notificações. |

## Regras que afetam a proposta

1. **Permissões:** proprietário administra membros, módulos e campanhas. Gerente opera os cadastros e fluxos previstos. Funcionário possui consulta; não prometer lançamento de pedidos por esse papel sem alteração da matriz.
2. **Dependências:** compras exige estoque; pedidos trabalham com atendimento e cardápio; QR de consumo depende de Atendimentos, Cardápio e Pedidos, somando Mesas no fluxo por mesa. O cardápio de pedidos precisa estar preparado na versão atual do modelo.
3. **Métricas:** a tela atual do parceiro utiliza os eventos apresentados para calcular os indicadores. Não repetir a observação antiga do README de que a seleção do local nunca filtra as métricas.
4. **Histórico:** considera encerramentos entre início inclusivo e fim exclusivo, no fuso do navegador. Clientes são visitas sem deduplicação. Ticket médio é por atendimento encerrado. Horários de pico vêm das aberturas dos atendimentos desse recorte.
5. **Conta:** fechamento não processa pagamento. Consumo operacional não comprova faturamento fiscal nem valores recebidos. Pedidos pendentes em atendimentos fechados exigem revisão dos totais.
6. **Estoque:** cadastrar receita não movimenta saldo. Pedidos não geram baixas automáticas. Ajustes preservam o histórico de movimentações.
7. **Compras:** a interface confirma o saldo total; recebimento parcial é preparação de modelo, não fluxo disponível. Custos não criam caixa ou contas a pagar.
8. **QR e presença:** check-in do local é separado do atendimento. QR identifica local/mesa e não embute um atendimento fixo. Acompanhamento do cliente lista seus pedidos no estabelecimento, não necessariamente apenas os da jornada atual.
9. **Eventos:** Bora é interesse, não reserva. Ingresso usa link externo. Check-in de evento exige horário e proximidade na aplicação, sem promessa de comprovação antifraude.
10. **Notificações:** preferências, registro do dispositivo e rascunhos estão implementados; envio confiável e automações dependem de serviço e validação complementar.
11. **Evoluções:** Analytics e Heatmap de gestão estão planejados. A visualização pública de mapa/calor de Boras não deve ser apresentada como módulo analítico de circulação física ou rastreamento de pessoas.
12. **Comercial:** não há preço, prazo, SLA, desconto, garantia de resultado ou compromisso de roadmap aprovado nesta documentação.

## Roteiro sugerido de demonstração - 20 minutos

| Tempo | Demonstrar | Mensagem principal |
| --- | --- | --- |
| 0-3 min | Busca, página pública, evento e Bora | Como o público descobre o local e demonstra interesse. |
| 3-6 min | Painel, cadastro, cardápio e mesas | Como o estabelecimento prepara sua operação. |
| 6-11 min | QR, check-in, início do atendimento e pedido | A passagem da visita para o consumo. |
| 11-14 min | Mudança de status, conta e encerramento | Como a operação acompanha o atendimento. |
| 14-17 min | Resumo por período, estoque e compra recebida | Consulta do consumo e organização do abastecimento. |
| 17-20 min | Papéis, módulos, limites e proposta | Adequação ao negócio e definição do escopo contratado. |

Use um ambiente de demonstração com dados autorizados e módulos liberados. Exemplos de vendas, valores e clientes devem ser identificados como ilustrativos. Preparar proprietário, gerente e cliente permite demonstrar as permissões sem alterar contas reais.

## Imagens recomendadas para uma futura edição ilustrada

- Painel com mesas e atendimentos: mostrar visão da operação.
- Cardápio com categorias: mostrar clareza da oferta.
- Pedido em preparo e conta: mostrar acompanhamento e totalização.
- Histórico por período: mostrar indicadores com a definição de consumo operacional.
- Estoque e compra: mostrar reposição e recebimento.
- Página pública e experiência do QR no celular: mostrar a perspectiva do usuário.

Capturar telas somente com dados de demonstração. A versão entregue usa texto e tabelas; não contém capturas de tela nem imagens que simulem uma interface validada.
