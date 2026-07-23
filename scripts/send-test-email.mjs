// Testa a configuração de e-mail SMTP do .env.
//
//   node scripts/send-test-email.mjs                 → só valida a conexão/login (não envia)
//   node scripts/send-test-email.mjs voce@email.com  → valida e ENVIA um e-mail de teste
//
// Usa as mesmas variáveis do SmtpEmailProvider (src/apis/email.api.ts).
import 'dotenv/config';
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM?.trim();
const port = Number(process.env.SMTP_PORT ?? '587');
const secure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE.toLowerCase() === 'true'
  : port === 465;

const mask = (s) => (s ? s.slice(0, 2) + '***' + s.slice(-1) : '(vazio)');
console.log('Config lida do .env:');
console.log(`  EMAIL_PROVIDER = ${process.env.EMAIL_PROVIDER}`);
console.log(`  SMTP_HOST      = ${host}`);
console.log(`  SMTP_PORT      = ${port}  (secure=${secure})`);
console.log(`  SMTP_USER      = ${user}`);
console.log(`  SMTP_PASS      = ${mask(pass)}  (${pass ? pass.length : 0} caracteres)`);
console.log(`  EMAIL_FROM     = ${from}`);

const missing = [];
if (!host) missing.push('SMTP_HOST');
if (!user) missing.push('SMTP_USER');
if (!pass) missing.push('SMTP_PASS');
if (!from) missing.push('EMAIL_FROM');
if (missing.length) {
  console.error(`\n❌ Faltam variáveis no .env: ${missing.join(', ')}`);
  process.exit(1);
}

const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

try {
  console.log('\n⏳ Validando conexão/login com o servidor SMTP...');
  await transporter.verify();
  console.log('✅ Conexão e login OK — o Gmail aceitou as credenciais.');
} catch (err) {
  console.error('\n❌ Falha ao conectar/logar:', err.message);
  console.error('\nDicas: senha de app (16 letras, sem espaços) · verificação em 2 etapas ligada · SMTP_USER = e-mail completo.');
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.log('\nℹ️  Sem destinatário: parei na validação (nada foi enviado).');
  console.log('   Para enviar de verdade: node scripts/send-test-email.mjs voce@email.com');
  process.exit(0);
}

try {
  console.log(`\n⏳ Enviando e-mail de teste para ${to}...`);
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Teste de e-mail — Adimplo',
    text: 'Se você está lendo isto, o envio de e-mail do Adimplo (SMTP) está funcionando. 🎉',
  });
  console.log(`✅ Enviado! messageId: ${info.messageId}`);
  console.log('   Confira a caixa de entrada (e a de spam, no 1º envio).');
} catch (err) {
  console.error('\n❌ Falha ao enviar:', err.message);
  process.exit(1);
}
