# Frontend

Espaço reservado para o frontend do Billing (SPA — React/Vue/etc.).

## Como plugar no deploy free tier

1. Coloque o **build** do front em `frontend/dist/` (a saída do `npm run build` do seu SPA — ex.: Vite gera `dist/`).
2. Descomente o serviço `web` em [`../docker-compose.free.yml`](../docker-compose.free.yml).
3. (Opcional) Remova o `ports: "3000:3000"` da API — com o `web` na porta 80 fazendo proxy de `/api`, a API não precisa ficar exposta.
4. Suba: `docker compose -f docker-compose.free.yml up -d`.

O `nginx.conf` já serve o SPA e faz proxy de `/api` → `api:3000`. O front deve chamar a API por caminhos relativos (`/api/...`), assim funciona sem CORS e sem hardcode de host.

> Enquanto não houver `frontend/dist`, mantenha o serviço `web` comentado.
