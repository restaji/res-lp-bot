import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_CHAT_ID;
const calls = [];
process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
process.env.TELEGRAM_CHAT_ID = "test-chat";
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), body: JSON.parse(options.body) });
  return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
};

const telegram = await import(`../telegram.js?telegram-format-test=${Date.now()}`);

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  if (originalChatId == null) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = originalChatId;
});

test("Telegram HTML formatter renders Markdown emphasis and escapes raw HTML", () => {
  assert.equal(typeof telegram.formatTelegramHtml, "function");
  assert.equal(
    telegram.formatTelegramHtml("**Bold** & <tag>\n- item\n`a<b`"),
    "<b>Bold</b> &amp; &lt;tag&gt;\n• item\n<code>a&lt;b</code>",
  );
});

test("Telegram formatter handles headings, italic, and fenced code safely", () => {
  assert.equal(
    telegram.formatTelegramHtml("## Heading\n*italic*\n```js\nconst a = 1 < 2;\n```"),
    "<b>Heading</b>\n<i>italic</i>\n<pre>const a = 1 &lt; 2;</pre>",
  );
});

test("send and edit APIs set Telegram HTML parse mode", async () => {
  calls.length = 0;
  await telegram.sendMessage("**sent**");
  await telegram.sendMessageWithButtons("**sent with buttons**", []);
  await telegram.editMessage("**edited**", 42);
  await telegram.editMessageWithButtons("**edited with buttons**", 43, []);

  assert.equal(calls.length, 4);
  assert.equal(calls[0].body.parse_mode, "HTML");
  assert.equal(calls[0].body.text, "<b>sent</b>");
  assert.equal(calls[1].body.parse_mode, "HTML");
  assert.equal(calls[1].body.text, "<b>sent with buttons</b>");
  assert.equal(calls[2].body.parse_mode, "HTML");
  assert.equal(calls[2].body.text, "<b>edited</b>");
  assert.equal(calls[3].body.parse_mode, "HTML");
  assert.equal(calls[3].body.text, "<b>edited with buttons</b>");
});
