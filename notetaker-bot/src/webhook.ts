export async function sendWebhook(
  callbackUrl: string,
  callbackSecret: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': callbackSecret,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[WEBHOOK] Failed (${response.status}): ${text}`);
  } else {
    console.log(`[WEBHOOK] Success: ${payload.eventType}`);
  }
}
