# Módulos por estabelecimento

A configuração operacional fica em `places/{placeId}/settings/modules`; o catálogo central está em `src/shared/placeModules.ts`. Entitlement comercial e ativação operacional são conceitos separados.

- Eventos e Equipe são sempre habilitados.
- Cardápio e Atendimentos seguem suas regras operacionais atuais.
- Mesas, Pedidos, Estoque, Compras e Notificações exigem entitlement e ativação.
- Analytics e Heatmap permanecem planejados e não ganham rota apenas por uma flag.

Em `/admin`, **Liberado pelo plano** pode ser alterado pelo administrador. **Ativado pelo estabelecimento** é exibido separadamente e permanece sob controle da área do parceiro.
