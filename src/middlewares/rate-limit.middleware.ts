import rateLimit from 'express-rate-limit';

/**
 * Rate limit das rotas de autenticação (login/registro) — anti brute-force e
 * anti-abuso (PR-11). Janela de 15 min por IP.
 *
 * ⚠️ Requer `app.set('trust proxy', 1)` no server (a API fica atrás do Caddy):
 * sem isso o `req.ip` seria o do proxy e o limite valeria para TODOS juntos.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,                  // 20 tentativas por IP na janela
  standardHeaders: true,    // expõe RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

/**
 * Limite geral, folgado — barra abuso grosseiro sem atrapalhar uso normal.
 * Aplicado a toda a API (exceto o que tiver limite próprio, como auth).
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // 120 req/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições excedido. Aguarde um instante.' },
});

/**
 * Limite da rota PÚBLICA do link do Elo (`/r/:token`, spec 0016). Sem JWT, então
 * precisa de anti-abuso próprio (scraping de tokens). Folgado o suficiente para o
 * pagador legítimo reabrir o link várias vezes (é isso que alimenta o "open").
 */
export const linkLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,             // 60 aberturas/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas aberturas em pouco tempo. Aguarde um instante.' },
});

/**
 * Limite do ACEITE de acordo (spec 0018 — M2). Rota pública que CRIA uma
 * cobrança nova no gateway → mais sensível que só abrir o link. Estreito por IP.
 */
export const agreementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15,                  // 15 aceites/15min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de acordo. Aguarde alguns minutos.' },
});
