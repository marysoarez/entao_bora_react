# Planos e entitlements

O entitlement comercial de cada estabelecimento fica em `places/{placeId}/settings/entitlements`. O documento usa `schemaVersion: 1`, `planKey`, `status`, `validUntil` e o mapa `features` definido centralmente em `src/shared/placeEntitlements.ts`.

As concessões são alteradas somente pela callable Function `adminUpdatePlaceEntitlements`. Ela exige um usuário autenticado, ativo e com `users/{uid}.role == "admin"`, valida todas as features, grava `updatedAt`/`updatedBy` e cria uma entrada imutável em `adminAuditLogs`. As Rules bloqueiam escritas de clientes no entitlement.

Status que concedem acesso: `active` e `trialing`, desde que `validUntil` seja nulo ou esteja no futuro. A existência de uma feature não disponibiliza módulos ainda planejados.

## Operação

Abra `/admin`, escolha **Planos e módulos**, selecione o estabelecimento, ajuste o plano, status, validade e funcionalidades e confirme. A implantação requer as Functions e Rules do mesmo projeto Firebase.

Para conceder o primeiro administrador, faça uma alteração privilegiada fora do cliente (Firebase Console/Admin SDK): defina `users/{uid}.role = "admin"` e `active = true`. Alterações seguintes podem ser feitas em `/admin` e são auditadas.
