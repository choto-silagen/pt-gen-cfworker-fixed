const fs = require("node:fs");
const vm = require("node:vm");

function configureProxy() {
  const rawProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (!rawProxy) return;

  try {
    const {ProxyAgent, setGlobalDispatcher} = require("undici");
    const url = new URL(rawProxy);
    const options = {uri: rawProxy};
    if (url.username || url.password) {
      const username = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      options.token = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
      url.username = "";
      url.password = "";
      options.uri = url.toString();
    }
    setGlobalDispatcher(new ProxyAgent(options));
  } catch (error) {
    console.warn(`Proxy env is set, but undici ProxyAgent is unavailable: ${error.message}`);
  }
}

function loadWorker() {
  let fetchHandler;
  globalThis.addEventListener = (type, handler) => {
    if (type === "fetch") fetchHandler = handler;
  };
  vm.runInThisContext(fs.readFileSync("dist/worker.js", "utf8"), {filename: "dist/worker.js"});
  if (!fetchHandler) throw new Error("No fetch handler registered by dist/worker.js");
  return fetchHandler;
}

async function workerFetch(fetchHandler, url, init = {}) {
  let responsePromise;
  const request = new Request(url, init);
  const event = {
    request,
    waitUntil() {},
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    }
  };
  fetchHandler(event);
  if (!responsePromise) throw new Error(`No response for ${url}`);
  return responsePromise;
}

function assertCase(name, condition, details) {
  if (!condition) {
    throw new Error(`${name} failed: ${details}`);
  }
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) return response.json();
  return response.text();
}

async function checkJson(fetchHandler, name, url, predicate) {
  const started = Date.now();
  const response = await workerFetch(fetchHandler, url);
  const body = await readResponse(response);
  assertCase(name, response.status === 200, `status ${response.status}`);
  assertCase(name, typeof body === "object", "expected JSON response");
  assertCase(name, predicate(body), JSON.stringify({
    success: body.success,
    error: body.error,
    title: body.chinese_title || body.name || body.name_cn || (body.data && body.data[0] && body.data[0].title),
    formatLength: (body.format || "").length
  }));
  console.log(`${name}: ok (${Date.now() - started}ms)`);
}

(async () => {
  configureProxy();
  const fetchHandler = loadWorker();

  const home = await workerFetch(fetchHandler, "https://ptgen.test/");
  assertCase("home", home.status === 200, `status ${home.status}`);
  assertCase("home", (home.headers.get("content-type") || "").includes("text/html"), "expected HTML");
  console.log("home: ok");

  const options = await workerFetch(fetchHandler, "https://ptgen.test/?site=douban&sid=1292052", {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.test",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Content-Type"
    }
  });
  assertCase("options", options.status === 200, `status ${options.status}`);
  assertCase("options", options.headers.get("Access-Control-Allow-Origin") === "*", "missing CORS header");
  console.log("options: ok");

  await checkJson(fetchHandler, "douban-search", "https://ptgen.test/?source=douban&search=%E8%82%96%E7%94%B3%E5%85%8B", body => body.success && body.data && body.data.length > 0);
  await checkJson(fetchHandler, "imdb-search", "https://ptgen.test/?source=imdb&search=shawshank", body => body.success && body.data && body.data.length > 0);
  await checkJson(fetchHandler, "bangumi-search", "https://ptgen.test/?source=bangumi&search=cowboy", body => body.success && body.data && body.data.length > 0);

  await checkJson(fetchHandler, "douban-gen", "https://ptgen.test/?site=douban&sid=1292052", body => body.success && body.format && body.format.includes("◎豆瓣链接"));
  await checkJson(fetchHandler, "douban-url", "https://ptgen.test/?url=https%3A%2F%2Fm.douban.com%2Fmovie%2Fsubject%2F1292052%2F", body => body.success && body.site === "douban");
  await checkJson(fetchHandler, "imdb-gen", "https://ptgen.test/?site=imdb&sid=tt0111161", body => body.success && body.format && body.imdb_rating);
  await checkJson(fetchHandler, "bangumi-gen", "https://ptgen.test/?site=bangumi&sid=2", body => body.success && body.format);
  await checkJson(fetchHandler, "steam-gen", "https://ptgen.test/?site=steam&sid=620", body => body.success && body.screenshot && body.screenshot.length > 0);
  await checkJson(fetchHandler, "steam-url", "https://ptgen.test/?url=https%3A%2F%2Fstore.steampowered.com%2Fapp%2F620%2FPortal_2%2F", body => body.success && body.site === "steam");
  await checkJson(fetchHandler, "epic-gen", "https://ptgen.test/?site=epic&sid=fortnite", body => body.success && body.screenshot && body.screenshot.length > 0);
  await checkJson(fetchHandler, "epic-url", "https://ptgen.test/?url=https%3A%2F%2Fstore.epicgames.com%2Fzh-CN%2Fp%2Ffortnite", body => body.success && body.site === "epic");
  await checkJson(fetchHandler, "indienova-gen", "https://ptgen.test/?site=indienova&sid=dead-cells", body => body.success && body.screenshot && body.screenshot.length > 0);
  await checkJson(fetchHandler, "bad-site", "https://ptgen.test/?site=missing&sid=1", body => !body.success && body.error === "Unknown value of key `site`.");

  globalThis.APIKEY = "secret";
  const missingKey = await workerFetch(fetchHandler, "https://ptgen.test/?site=douban&sid=1292052");
  assertCase("apikey-missing", missingKey.status === 403, `status ${missingKey.status}`);
  console.log("apikey-missing: ok");

  globalThis.DISABLE_SEARCH = "1";
  await checkJson(fetchHandler, "disable-search", "https://ptgen.test/?source=douban&search=x&apikey=secret", body => !body.success && body.error === "this ptgen disallow search");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
