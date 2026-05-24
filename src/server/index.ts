import http from 'http';
import { config } from '../config';
import { grantSubscription, getPendingOrder, deletePendingOrder } from '../db/queries';
import { capturePayPalOrder } from '../services/paypal';
import { bot } from '../bot';

export function startWebhookServer(): void {
  const server = http.createServer((req, res) => {

    // PayPal redirect after payment approval
    if (req.method === 'GET' && req.url?.startsWith('/payment/success')) {
      const url = new URL(req.url, 'http://localhost');
      const orderId = url.searchParams.get('token');
      if (!orderId) { res.writeHead(400); res.end('Missing token'); return; }

      getPendingOrder(orderId).then(async (userId) => {
        if (!userId) { res.writeHead(400); res.end('Order not found'); return; }
        const captured = await capturePayPalOrder(orderId);
        if (captured) {
          await grantSubscription(userId, 30);
          await deletePendingOrder(orderId);
          await bot.telegram.sendMessage(userId, `✅ התשלום התקבל! המנוי שלך פעיל ל-30 ימים.\nתודה שבחרת בנו! 💕`);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ התשלום התקבל!</h2><p>חזרי לטלגרם להמשך.</p></body></html>');
        } else {
          res.writeHead(400); res.end('Payment not completed');
        }
      }).catch((err) => { console.error('Payment success error:', err); res.writeHead(500); res.end('Error'); });
      return;
    }

    // PayPal cancel
    if (req.method === 'GET' && req.url?.startsWith('/payment/cancel')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>התשלום בוטל.</h2><p>חזרי לטלגרם ונסי שוב: /subscribe</p></body></html>');
      return;
    }

    // Manual webhook (for testing / admin grants)
    if (req.method === 'POST' && req.url === '/webhook/payment') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { userId, days, secret } = JSON.parse(body);
          if (secret !== config.webhookSecret) { res.writeHead(401); res.end('Unauthorized'); return; }
          await grantSubscription(Number(userId), Number(days));
          await bot.telegram.sendMessage(userId, `✅ התשלום התקבל! המנוי שלך פעיל ל-${days} ימים.\nתודה שבחרת בנו! 💕`);
          res.writeHead(200); res.end('OK');
        } catch (err) {
          console.error('Webhook error:', err); res.writeHead(400); res.end('Bad request');
        }
      });
      return;
    }

    res.writeHead(404); res.end();
  });

  server.listen(config.port, () => console.log(`✅ Webhook server listening on port ${config.port}`));
}
