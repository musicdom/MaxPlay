"use strict";

const GIFT_ID_PATTERN = /^[0-9a-f-]{36}$/i;

/**
 * Build a safe, non-mutating preview for an incoming gift link.
 * This path is used before legal consent: it must never write to Redis,
 * start reveal timers, restore expired gifts, or add incoming-list entries.
 */
function buildReadOnlyGiftLinkPreview(gift, giftId, userId) {
  if (!GIFT_ID_PATTERN.test(String(giftId || ""))) {
    return { statusCode: 400, body: { ok: false, error: "invalid_gift_id" } };
  }
  if (!gift) {
    return { statusCode: 404, body: { ok: false, error: "gift_not_found" } };
  }

  const currentUserId = String(userId);
  const recipientId = String(gift.recipientId || "");
  const pickupTimedOut = gift.status === "expired" && gift.expiredReason === "pickup_timeout";
  if (gift.status !== "sent" && !pickupTimedOut) {
    if (recipientId === currentUserId) {
      return { statusCode: 200, body: { ok: true, alreadyReceived: true } };
    }
    return { statusCode: 409, body: { ok: false, error: "gift_not_available" } };
  }

  if (recipientId && recipientId !== currentUserId) {
    return { statusCode: 403, body: { ok: false, error: "wrong_recipient" } };
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      pending: true,
      previewOnly: true,
      gift: {
        id: String(giftId),
        status: "sent",
        senderName: String(gift.senderName || "Пользователь MAX").slice(0, 80)
      }
    }
  };
}

module.exports = { buildReadOnlyGiftLinkPreview };
