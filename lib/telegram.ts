/**
 * Minimal Telegram Bot API sender. One shared bot (TELEGRAM_BOT_TOKEN) can post to many
 * different chats/groups — each company just needs its own group chat_id stored in
 * companies.telegram_chat_id. See https://core.telegram.org/bots/api#sendmessage.
 */
export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN이 설정되지 않았습니다." };
  if (!chatId?.trim()) return { ok: false, error: "chat_id가 없습니다." };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, error: `Telegram API ${response.status}: ${body.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
