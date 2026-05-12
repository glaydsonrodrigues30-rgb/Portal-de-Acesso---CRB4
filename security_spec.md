# Security Specification: CRB-4 Sistema de Gestão Institucional

## 1. Data Invariants
- A `Debito` must have a valid `crb`, `ano`, and `valor`.
- `Auditoria` logs are immutable once created.
- Access to all operational data (`Debits`, `Notifications`, `Negotiations`, `Oficios`, `Processos`) requires an active, verified user session.
- Only users with `ADMIN` profile can manage users and delete records.
- Only users with `ADMIN` or `OPERACIONAL` profile can create or edit operational records.
- Users with `VISUALIZADOR` profile can only read.

## 2. The "Dirty Dozen" Payloads (Attack Vectors)

1. **Self-Promotion Attack**: Authenticated user attempts to update their own `perfil` to `ADMIN`.
2. **Orphaned Debit**: Creating a `Notificacao` for a non-existent `debitoId`.
3. **Ghost Field Injection**: Adding a `secretField: true` to a `Debito` record.
4. **Invalid CRB Poisoning**: Injecting a 1MB string into the `crb` field.
5. **Negative Value Sabotage**: Creating a `Debito` with a negative `valor`.
6. **Timeline Forgery**: Setting a `createdAt` date in the future for an `Auditoria` log.
7. **Identity Spoofing**: Creating an `Auditoria` log with someone else's `userId`.
8. **Unauthorized Deletion**: A `VISUALIZADOR` or `OPERACIONAL` user attempting to delete a `Debito`.
9. **Status Locking Bypass**: Updating a `Processo` that is already in a terminal state (e.g., `CONCLUIDO`).
10. **Shadow List Access**: Attempting to list all `users` as a non-admin.
11. **PII Leak**: An unauthenticated user attempting to `get` a user profile.
12. **Bulk Scrape Operation**: Attempting to list all `auditoria` logs as a non-admin.

## 3. Test Runner Concept (firestore.rules.test.ts)
The tests will verify:
- `get` on `/users/{uid}` fails for other users.
- `update` on `perfil` in `/users/{uid}` fails for the user themselves.
- `create` on `/debits` fails for `VISUALIZADOR`.
- `delete` on `/debits` fails for `OPERACIONAL`.
- `create` on `/auditoria` succeeds for any `isSignedIn()`.
- `delete` on `/auditoria` fails for everyone.
