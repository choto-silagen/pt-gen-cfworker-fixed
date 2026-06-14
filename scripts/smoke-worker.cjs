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

function configureCache() {
  globalThis.caches = {
    default: {
      async match() {
        return null;
      },
      async put() {
        return undefined;
      }
    }
  };
}

async function loadWorker() {
  const source = fs.readFileSync("dist/worker.js", "utf8");
  if (/\bexport\s*(?:\{|default\b)/.test(source)) {
    const encoded = Buffer.from(source).toString("base64");
    const workerModule = await import(`data:text/javascript;base64,${encoded}`);
    if (!workerModule.default || typeof workerModule.default.fetch !== "function") {
      throw new Error("Module worker does not export default.fetch");
    }
    return {
      type: "module",
      fetch: workerModule.default.fetch.bind(workerModule.default)
    };
  }

  let fetchHandler;
  globalThis.addEventListener = (type, handler) => {
    if (type === "fetch") fetchHandler = handler;
  };
  vm.runInThisContext(source, {filename: "dist/worker.js"});
  if (!fetchHandler) throw new Error("No fetch handler registered by dist/worker.js");
  return {
    type: "service-worker",
    fetch: fetchHandler
  };
}

async function workerFetch(worker, url, init = {}, env = {}) {
  const request = new Request(url, init);
  const pending = [];
  const ctx = {
    waitUntil(promise) {
      if (this !== ctx) throw new TypeError("Illegal invocation: waitUntil called without ctx");
      pending.push(Promise.resolve(promise));
    }
  };

  if (worker.type === "module") {
    const response = await worker.fetch(request, env, ctx);
    await Promise.allSettled(pending);
    return response;
  }

  let responsePromise;
  const event = {
    request,
    waitUntil(promise) {
      if (this !== event) throw new TypeError("Illegal invocation: waitUntil called without event");
      pending.push(Promise.resolve(promise));
    },
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    }
  };
  worker.fetch(event);
  if (!responsePromise) throw new Error(`No response for ${url}`);
  const response = await responsePromise;
  await Promise.allSettled(pending);
  return response;
}

function assertCase(name, condition, details) {
  if (!condition) {
    throw new Error(`${name} failed: ${details}`);
  }
}

function createKVMock(seed = {}) {
  const data = new Map(Object.entries(seed));
  const kv = {
    async get(key) {
      if (this !== kv) throw new TypeError("Illegal invocation: KV get called without binding");
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value) {
      if (this !== kv) throw new TypeError("Illegal invocation: KV put called without binding");
      data.set(key, value);
    }
  };
  return kv;
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) return response.json();
  return response.text();
}

async function checkJson(worker, name, url, predicate, env) {
  const started = Date.now();
  const response = await workerFetch(worker, url, undefined, env);
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
  return body;
}

(async () => {
  configureProxy();
  configureCache();
  const worker = await loadWorker();

  const home = await workerFetch(worker, "https://ptgen.test/");
  assertCase("home", home.status === 200, `status ${home.status}`);
  assertCase("home", (home.headers.get("content-type") || "").includes("text/html"), "expected HTML");
  console.log("home: ok");

  const options = await workerFetch(worker, "https://ptgen.test/?site=douban&sid=1292052", {
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

  await checkJson(worker, "douban-search", "https://ptgen.test/?source=douban&search=%E8%82%96%E7%94%B3%E5%85%8B", body => body.success && body.data && body.data.length > 0);
  await checkJson(worker, "imdb-search", "https://ptgen.test/?source=imdb&search=shawshank", body => body.success && body.data && body.data.length > 0);
  await checkJson(worker, "bangumi-search", "https://ptgen.test/?source=bangumi&search=cowboy", body => body.success && body.data && body.data.length > 0);

  const doubanGen = await checkJson(worker, "douban-gen", "https://ptgen.test/?site=douban&sid=1292052", body => body.success && body.format && body.format.includes("◎豆瓣链接"));
  const doubanPoster = (doubanGen.format || "").match(/\[img\](.*?)\[\/img\]/)[1];
  const doubanPosterProxy = new URL(doubanPoster);
  assertCase("douban-poster-proxy-url", doubanPosterProxy.origin === "https://ptgen.test" && doubanPosterProxy.searchParams.get("image").includes("doubanio.com"), doubanPoster);
  console.log("douban-poster-proxy-url: ok");
  const doubanPosterResponse = await workerFetch(worker, doubanPoster);
  assertCase("douban-poster-proxy-fetch", doubanPosterResponse.status === 200 && (doubanPosterResponse.headers.get("content-type") || "").startsWith("image/"), `status ${doubanPosterResponse.status}`);
  await doubanPosterResponse.arrayBuffer();
  console.log("douban-poster-proxy-fetch: ok");
  await checkJson(worker, "douban-url", "https://ptgen.test/?url=https%3A%2F%2Fm.douban.com%2Fmovie%2Fsubject%2F1292052%2F", body => body.success && body.site === "douban");
  await checkJson(worker, "imdb-gen", "https://ptgen.test/?site=imdb&sid=tt0111161", body => body.success && body.format && body.imdb_rating);
  await checkJson(worker, "bangumi-gen", "https://ptgen.test/?site=bangumi&sid=2", body => body.success && body.format);
  await checkJson(worker, "steam-gen", "https://ptgen.test/?site=steam&sid=620", body => body.success && body.screenshot && body.screenshot.length > 0);
  await checkJson(worker, "steam-url", "https://ptgen.test/?url=https%3A%2F%2Fstore.steampowered.com%2Fapp%2F620%2FPortal_2%2F", body => body.success && body.site === "steam");
  await checkJson(worker, "epic-gen", "https://ptgen.test/?site=epic&sid=fortnite", body => body.success && body.screenshot && body.screenshot.length > 0);
  await checkJson(worker, "epic-url", "https://ptgen.test/?url=https%3A%2F%2Fstore.epicgames.com%2Fzh-CN%2Fp%2Ffortnite", body => body.success && body.site === "epic");
  await checkJson(worker, "indienova-gen", "https://ptgen.test/?site=indienova&sid=dead-cells", body => body.success && body.screenshot && body.screenshot.length > 0);
  await checkJson(worker, "bad-site", "https://ptgen.test/?site=missing&sid=1", body => !body.success && body.error === "Unknown value of key `site`.");

  const kv = createKVMock({
    "info-douban-1292052": JSON.stringify({
      success: true,
      site: "douban",
      format: "cached kv response"
    })
  });
  await checkJson(worker, "kv-binding", "https://ptgen.test/?site=douban&sid=1292052", body => body.success && body.format === "cached kv response", {
    PT_GEN_STORE: kv
  });

  const missingKey = await workerFetch(worker, "https://ptgen.test/?site=douban&sid=1292052", undefined, {APIKEY: "secret"});
  assertCase("apikey-missing", missingKey.status === 403, `status ${missingKey.status}`);
  console.log("apikey-missing: ok");

  await checkJson(worker, "disable-search", "https://ptgen.test/?source=douban&search=x&apikey=secret", body => !body.success && body.error === "this ptgen disallow search", {
    APIKEY: "secret",
    DISABLE_SEARCH: "1"
  });
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
