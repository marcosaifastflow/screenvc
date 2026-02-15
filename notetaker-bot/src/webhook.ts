export async function sendWebhook(
  callbackUrl: string,
  callbackSecret: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': callbackSecret,
      apikey: 'service-call',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[WEBHOOK] Failed (${response.status}): ${text}`);
  }
}
