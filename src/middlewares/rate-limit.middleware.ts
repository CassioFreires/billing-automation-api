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
