"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReadOnlyGiftLinkPreview } = require("../gift-link-preview.cjs");

const giftId = "123e4567-e89b-12d3-a456-426614174000";
const userId = "10001";

function makeGift(overrides = {}) {
  return {
    id: giftId,
    status: "sent",
    recipientId: userId,
    senderName: "Отправитель",
    giftType: "loviday",
    message: "Личное сообщение",
    revealDelaySeconds: 3600,
    opensAt: null,
    pickupExpiresAt: null,
    ...overrides
  };
}

test("returns a minimal pending preview without exposing gift contents", () => {
  const gift = makeGift();
  const result = buildReadOnlyGiftLinkPreview(gift, giftId, userId);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.previewOnly, true);
  assert.deepEqual(result.body.gift, {
    id: giftId,
    status: "sent",
    senderName: "Отправитель"
  });
  assert.equal("giftType" in result.body.gift, false);
  assert.equal("message" in result.body.gift, false);
});

test("previews pickup-timeout gifts without reviving or mutating them", () => {
  const gift = makeGift({
    status: "expired",
    expiredReason: "pickup_timeout",
    expiredAt: 123,
    pickupExpiresAt: 456
  });
  const before = structuredClone(gift);

  const result = buildReadOnlyGiftLinkPreview(gift, giftId, userId);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.previewOnly, true);
  assert.deepEqual(gift, before);
});

test("does not reveal a gift to a different recipient", () => {
  const result = buildReadOnlyGiftLinkPreview(makeGift(), giftId, "99999");
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, "wrong_recipient");
});

test("reports an already received gift without creating a preview", () => {
  const result = buildReadOnlyGiftLinkPreview(makeGift({ status: "owned" }), giftId, userId);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.alreadyReceived, true);
  assert.equal(result.body.previewOnly, undefined);
});

test("rejects unavailable gifts and malformed identifiers", () => {
  const unavailable = buildReadOnlyGiftLinkPreview(makeGift({ status: "kept", recipientId: "99999" }), giftId, userId);
  const malformed = buildReadOnlyGiftLinkPreview(makeGift(), "not-a-gift-id", userId);

  assert.equal(unavailable.statusCode, 409);
  assert.equal(unavailable.body.error, "gift_not_available");
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.error, "invalid_gift_id");
});
