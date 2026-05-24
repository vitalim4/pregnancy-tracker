import { config } from '../config';

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${config.paypal.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as any;
  return data.access_token;
}

export async function createPayPalOrder(userId: number): Promise<{ orderId: string; approvalUrl: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${config.paypal.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'ILS', value: '19.90' }, description: 'מנוי חודשי - עוזרת הריון' }],
      application_context: {
        return_url: `${config.appUrl}/payment/success`,
        cancel_url: `${config.appUrl}/payment/cancel`,
        brand_name: 'עוזרת הריון',
      },
    }),
  });
  const data = await res.json() as any;
  const orderId = data.id;
  const approvalUrl = data.links.find((l: any) => l.rel === 'approve').href;
  return { orderId, approvalUrl };
}

export async function capturePayPalOrder(orderId: string): Promise<boolean> {
  const token = await getAccessToken();
  const res = await fetch(`${config.paypal.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json() as any;
  return data.status === 'COMPLETED';
}
