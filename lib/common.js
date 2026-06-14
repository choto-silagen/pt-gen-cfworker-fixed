const cheerio = require("cheerio"); // HTML页面解析
const HTML2BBCode = require("html2bbcode").HTML2BBCode;
let runtimeEnv = {};

// 常量定义
export function setRuntimeEnv(env = {}) {
  runtimeEnv = env || {};
}

export function getEnv(name) {
  if (runtimeEnv && Object.prototype.hasOwnProperty.call(runtimeEnv, name)) return runtimeEnv[name];
  if (globalThis[name]) return globalThis[name];
  if (typeof process !== "undefined" && process.env && process.env[name]) return process.env[name];
  return undefined;
}

export function getBinding(name) {
  return getEnv(name);
}

export const AUTHOR = "Rhilip";
const VERSION = "0.7.0";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; pt-gen-cfworker/0.7; +https://github.com/Rhilip/pt-gen-cfworker)";

export function getAuthor() {
  return getEnv('AUTHOR') || AUTHOR;
}

/** 公有的JSON字段，其他字段为不同生成模块的信息
 *  考虑到历史兼容的问题，应该把所有字段都放在顶层字典
 *  （虽然说最好的实践是放在 root.data 里面
 */
const default_body = {
  "success": false, // 请求是否成功，客户端应该首先检查该字段
  "error": null, // 如果请求失败，此处为失败原因
  "format": "", // 使用BBCode格式整理的简介
  "copyright": `Powered by @${AUTHOR}`, // 版权信息
  "version": VERSION, // 版本
  "generate_at": 0 // 生成时间（毫秒级时间戳），可以通过这个值与当前时间戳比较判断缓存是否应该过期
};

export const NONE_EXIST_ERROR = "The corresponding resource does not exist.";
export const FETCH_BLOCKED_ERROR = "The upstream site blocked this request. Try again later or configure a valid cookie.";

export function withDefaultHeaders(init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("User-Agent")) headers.set("User-Agent", DEFAULT_USER_AGENT);
  if (!headers.has("Accept-Language")) headers.set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
  return {
    ...init,
    headers
  };
}

export async function fetchText(url, init = {}) {
  const response = await fetchWithTimeout(url, init);
  return {
    response,
    text: await response.text()
  };
}

export async function fetchJson(url, init = {}) {
  const response = await fetchWithTimeout(url, init);
  return {
    response,
    json: await response.json()
  };
}

async function fetchWithTimeout(url, init = {}) {
  const timeout_ms = Number(init.timeoutMs || getEnv('FETCH_TIMEOUT_MS') || 15000);
  const fetch_init = {...init};
  delete fetch_init.timeoutMs;

  if (fetch_init.signal || typeof AbortController === "undefined") {
    return fetch(url, withDefaultHeaders(fetch_init));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);
  try {
    return await fetch(url, withDefaultHeaders({
      ...fetch_init,
      signal: controller.signal
    }));
  } finally {
    clearTimeout(timer);
  }
}

export function compactText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function safeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

export function safeJsonParse(raw, fallback = {}) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// 解析HTML页面
export function page_parser(responseText) {
  return cheerio.load(responseText, {
    decodeEntities: false
  });
}

// 解析JSONP返回
export function jsonp_parser(responseText) {
  try {
    responseText = responseText.replace(/\n/ig, '').match(/[^(]+\((.+)\)/)[1];
    return JSON.parse(responseText);
  } catch (e) {
    return {}
  }
}

// Html2bbcode
export function html2bbcode(html) {
  let converter = new HTML2BBCode();
  let bbcode = converter.feed(html);
  return bbcode.toString();
}

export async function restoreFromKV(cache_key) {
  const store = getBinding('PT_GEN_STORE');
  if (store && typeof store.get === "function") {
    const cache_data = await store.get(cache_key)
    if (cache_data !== null) {
      return JSON.parse(cache_data)
    }
  }
}

// 返回Json请求
export function makeJsonRawResponse(body, headers) {
  const responseInit = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" // CORS
    },
    ...(headers || {})
  }
  return new Response(JSON.stringify(body || {}, null, 2), responseInit)
}

export function makeJsonResponse(body_update) {
  const body = Object.assign(
    {},
    default_body,
    {
      copyright: `Powered by @${getAuthor()}`
    },
    body_update || {}, {
      generate_at: (new Date()).valueOf()
    }
  );
  return makeJsonRawResponse(body)
}
