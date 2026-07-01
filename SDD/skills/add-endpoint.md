# Playbook: Adicionar um Endpoint REST

Para um endpoint dentro de um domínio que **já existe** (ex.: nova rota em `invoices`). Se o domínio é novo ou cruza fila/worker, use `add-feature.md`.

## Passos

1. **DTO (se houver entrada)** — `src/dtos/`, com Zod:
   ```ts
   export const fooSchema = z.object({ /* ... */ });
   export type FooDTO = z.infer<typeof fooSchema>;
   ```

2. **Repository (se tocar dados)** — método novo em `src/repositories/<domínio>.repository.ts`.

3. **Service** — método em `src/services/<domínio>.service.ts` com a regra.

4. **Controller** — handler em `src/controllers/<domínio>.controller.ts`:
   ```ts
   foo = async (req: Request, res: Response): Promise<void> => {
     try {
       const data = fooSchema.parse(req.body);
       const result = await this.service.foo(data);
       res.status(200).json(result);
     } catch (error: any) {
       res.status(400).json({ error: error.message });
     }
   };
   ```

5. **Router** — registre em `src/routers/<domínio>.router.ts`:
   ```ts
   router.post('/foo', controller.foo);            // arrow fn: sem .bind
   // ou, se método normal:
   router.post('/foo', controller.foo.bind(controller));
   ```

## Convenções de resposta

| Ação | Status |
|---|---|
| Criação | `201` |
| Assíncrono aceito | `202` |
| OK com corpo | `200` |
| Sem corpo | `204` |
| Entrada inválida | `400` · Não encontrado | `404` · Erro interno | `500` |

## Verificação

- `npm run build` limpo.
- Teste com `curl` (ver exemplos em `run-and-debug.md`).
- Confirme o **prefixo completo**: rotas ficam sob `/api/<domínio>/...`.

## Erros comuns

- Esquecer `.js` no import → quebra em runtime.
- Método normal no router sem `.bind(controller)` → `this` indefinido.
- Regra de negócio vazando para o controller → mova para o service.
