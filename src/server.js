import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function safeEqual(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Invalid JSON");
    error.status = 400;
    throw error;
  }
}

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function buildCard(input) {
  const title = cleanText(input.title, 100);
  if (!title) {
    const error = new Error("title is required");
    error.status = 400;
    throw error;
  }

  const fields = [];
  const addField = (label, value) => {
    const text = cleanText(value, 300);
    if (text) fields.push({ is_short: true, text: { tag: "lark_md", content: `**${label}**\n${text}` } });
  };

  addField("达人", input.creator);
  addField("状态", input.status);
  addField("事件", input.event);

  if (input.metrics && typeof input.metrics === "object" && !Array.isArray(input.metrics)) {
    for (const [key, value] of Object.entries(input.metrics).slice(0, 20)) {
      addField(cleanText(key, 50), String(value ?? ""));
    }
  }

  const elements = [];
  if (fields.length) elements.push({ tag: "div", fields });
  const note = cleanText(input.note, 1000);
  if (note) elements.push({ tag: "div", text: { tag: "lark_md", content: note } });

  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { template: "blue", title: { tag: "plain_text", content: title } },
      elements
    }
  };
}

async function sendToFeishu(payload) {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    const error = new Error("Server is not configured");
    error.status = 503;
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    const error = new Error("Server webhook configuration is invalid");
    error.status = 503;
    throw error;
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "open.feishu.cn" ||
      !parsed.pathname.startsWith("/open-apis/bot/v2/hook/")) {
    const error = new Error("Server webhook configuration is invalid");
    error.status = 503;
    throw error;
  }

  const response = await fetch(parsed, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "error"
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || (result.code !== undefined && result.code !== 0)) {
    const error = new Error("Feishu rejected the notification");
    error.status = 502;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST" || url.pathname !== "/api/notify") {
    return json(res, 404, { error: "Not found" });
  }

  if (!safeEqual(req.headers["x-notify-key"], process.env.NOTIFY_API_KEY)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  try {
    const input = await readJson(req);
    await sendToFeishu(buildCard(input));
    return json(res, 200, { ok: true });
  } catch (error) {
    const status = Number(error.status) || (error.name === "TimeoutError" ? 504 : 500);
    console.error("Notification failed", { status, type: error.name });
    return json(res, status, { error: status >= 500 ? "Notification failed" : error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Notifier listening on port ${PORT}`);
});
