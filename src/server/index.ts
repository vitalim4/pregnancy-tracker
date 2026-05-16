import http from 'http';
import { config } from '../config';
import { grantSubscription } from '../db/queries';
import { bot } from '../bot';

export function startWebhookServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook/payment') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { userId, days, secret } = JSON.parse(body);
          if (secret !== config.webhookSecret) {
            res.writeHead(401);
            res.end('Unauthorized');
            return;
          }
          await grantSubscription(Number(userId), Number(days));
          await bot.telegram.sendMessage(
            userId,
            `✅ התשלום התקבל! המנוי שלך פעיל ל-${days} ימים.\nתודה שבחרת בנו! 💕`,
          );
          res.writeHead(200);
          res.end('OK');
        } catch (err) {
          console.error('Webhook error:', err);
          res.writeHead(400);
          res.end('Bad request');
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(config.port, () => console.log(`✅ Webhook server listening on port ${config.port}`));
}