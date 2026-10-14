/**
 * Minimal Telegram Bot API sender. One shared bot (TELEGRAM_BOT_TOKEN) can post to many
 * different chats/groups — each company just needs its own group chat_id stored in
 * companies.telegram_chat_id. See https://core.telegram.org/bots/api#sendmessage.
 */
export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

type TelegramUpdate = {
  message?: {
    chat?: { id?: number; title?: string; type?: string };
    date?: number;
    text?: string;
  };
};

export type TelegramChatCandidate = { chatId: string; title: string };

export function isTelegramAccessFailure(error?: string) {
  const normalized = (error || "").toLowerCase();
  return normalized.includes("bot was kicked") || normalized.includes("bot kicked") || normalized.includes("chat not found") || normalized.includes("forbidden");
}

export async function findTelegramChatByConnectionCode(connectionCode: string): Promise<{ chat?: TelegramChatCandidate; error?: string; ok: boolean }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "텔레그램 봇 연결이 아직 설정되지 않았습니다." };
  if (!connectionCode.trim()) return { ok: false, error: "연결 코드를 확인해주세요." };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: TelegramUpdate[]; description?: string } | null;
    if (!response.ok || !payload?.ok) return { ok: false, error: payload?.description || "텔레그램 그룹 정보를 불러오지 못했습니다." };

    const match = [...(payload.result || [])]
      .reverse()
      .find((update) => {
        const chat = update.message?.chat;
        return update.message?.text?.trim() === connectionCode && (chat?.type === "group" || chat?.type === "supergroup") && Number.isFinite(chat.id);
      });
    const chat = match?.message?.chat;
    if (!chat?.id) return { ok: false, error: "연결 코드를 보낸 그룹을 찾지 못했습니다. 그룹에서 코드를 보낸 뒤 다시 시도해주세요." };
    return { ok: true, chat: { chatId: String(chat.id), title: chat.title || "텔레그램 그룹" } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "텔레그램 그룹 정보를 불러오지 못했습니다." };
  }
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
