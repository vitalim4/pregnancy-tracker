import { config } from '../config';

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${config.paypal.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as any;
  console.log('PayPal auth response:', JSON.stringify(data));
  if (!data.access_token) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
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
  console.log('PayPal create order response:', JSON.stringify(data));
  const orderId = data.id;
  const approvalUrl = data.links?.find((l: any) => l.rel === 'approve')?.href;
  if (!orderId || !approvalUrl) throw new Error(`PayPal order failed: ${JSON.stringify(data)}`);
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
