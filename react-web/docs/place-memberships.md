# Memberships de estabelecimentos

Os vínculos vivem em `places/{placeId}/members/{uid}` com `role` (`owner`, `manager` ou `employee`), `active` e `createdAt`. `ownerId` no estabelecimento continua sendo a âncora de compatibilidade e recuperação.

Um administrador global ativo possui acesso administrativo a todos os estabelecimentos sem precisar de membership individual. Isso não concede features comercialmente: entitlements continuam vinculados a cada estabelecimento.

O painel `/admin` mostra owners, memberships e o papel em cada estabelecimento. A gestão operacional de membros continua na área do parceiro.
