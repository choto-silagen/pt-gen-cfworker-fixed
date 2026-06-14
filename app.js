import {getAuthor, getBinding, getEnv, makeJsonResponse, makeJsonRawResponse, restoreFromKV, setRuntimeEnv} from "./lib/common";
import debug_get_err from "./lib/error";

import {search_douban, gen_douban} from "./lib/douban";
import {search_imdb, gen_imdb} from "./lib/imdb";
import {search_bangumi, gen_bangumi} from "./lib/bangumi";
import {gen_steam} from "./lib/steam";
import {gen_indienova} from "./lib/indienova";
import {gen_epic} from "./lib/epic";
import page from './index.html';

export const support_list = {
  "douban": /(?:https?:\/\/)?(?:(?:movie|www|m)\.)?douban\.com\/(?:subject|movie\/subject|movie)\/(\d+)\/?/,
  "imdb": /(?:https?:\/\/)?(?:www\.)?imdb\.com\/title\/(tt\d+)\/?/,
  "bangumi": /(?:https?:\/\/)?(?:bgm\.tv|bangumi\.tv|chii\.in|next\.bgm\.tv)\/subject\/(\d+)\/?/,
  "steam": /(?:https?:\/\/)?(?:store\.)?steam(?:powered|community)\.com\/app\/(\d+)\/?/,
  "indienova": /(?:https?:\/\/)?indienova\.com\/game\/(\S+)/,
  "epic": /(?:https?:\/\/)?(?:www\.)?(?:epicgames|store\.epicgames)\.com\/(?:store\/[a-zA-Z-]+\/(?:product|p)|site\/[a-zA-Z-]+\/p|[a-zA-Z-]+\/p)\/([^/?#]+)\/?/
};

const support_site_list = Object.keys(support_list);

export async function handleFetch(request, ctx = {}, env = {}) {
  setRuntimeEnv(env);

  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  const cache = globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
  let response = cache ? await cache.match(request) : null;
  const uri = new URL(request.url);

  if (!response) {
    try {
      let cache_key;
      if (uri.pathname === '/' && uri.search === '') {
        response = makeIndexResponse();
      } else {
        if (getEnv('APIKEY') && uri.searchParams.get('apikey') !== getEnv('APIKEY')) {
          return makeJsonRawResponse({
            'error': 'apikey required.'
          }, {status: 403})
        }

        let response_data;
        if (uri.searchParams.get('search')) {
          if (getEnv('DISABLE_SEARCH')) {
            response_data = {error: "this ptgen disallow search"};
          } else {
            let keywords = uri.searchParams.get('search');
            let source = uri.searchParams.get('source') || 'douban';
            cache_key = `search-${source}-${keywords}`

            const cache_data = await restoreFromKV(cache_key)
            if (cache_data) {
              response_data = cache_data
            } else if (support_site_list.includes(source)) {
              if (source === 'douban') {
                response_data = await search_douban(keywords)
              } else if (source === 'imdb') {
                response_data = await search_imdb(keywords)
              } else if (source === 'bangumi') {
                response_data = await search_bangumi(keywords)
              } else {
                response_data = {error: "Miss search function for `source`: " + source + "."}
              }
            } else {
              response_data = {error: "Unknown value of key `source`."};
            }
          }
        } else {
          let site, sid;

          if (uri.searchParams.get("url")) {
            let url_ = uri.searchParams.get("url");
            for (let site_ in support_list) {
              let pattern = support_list[site_];
              if (url_.match(pattern)) {
                site = site_;
                sid = url_.match(pattern)[1];
                break;
              }
            }
          } else {
            site = uri.searchParams.get("site");
            sid = uri.searchParams.get("sid");
          }

          if (site == null || sid == null) {
            response_data = {error: "Miss key of `site` or `sid` , or input unsupported resource `url`."};
          } else {
            cache_key = `info-${site}-${sid}`

            const cache_data = await restoreFromKV(cache_key)
            if (cache_data) {
              response_data = cache_data
            } else if (support_site_list.includes(site)) {
              if (site === "douban") {
                response_data = await gen_douban(sid);
              } else if (site === "imdb") {
                response_data = await gen_imdb(sid);
              } else if (site === "bangumi") {
                response_data = await gen_bangumi(sid);
              } else if (site === "steam") {
                response_data = await gen_steam(sid);
              } else if (site === "indienova") {
                response_data = await gen_indienova(sid);
              } else if (site === "epic") {
                response_data = await gen_epic(sid);
              } else {
                response_data = {error: "Miss generate function for `site`: " + site + "."};
              }
            } else {
              response_data = {error: "Unknown value of key `site`."};
            }
          }
        }

        if (response_data) {
          response = makeJsonResponse(response_data)
          const store = getBinding('PT_GEN_STORE');
          if (store && typeof store.put === "function" && typeof response_data.error === 'undefined') {
            await store.put(cache_key, JSON.stringify(response_data), {expirationTtl: 86400 * 2})
          }
        }
      }

      if (cache && request.method === "GET" && response && response.status === 200) {
        try {
          const cacheWrite = cache.put(request, response.clone());
          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(cacheWrite.catch(() => {}));
          } else {
            await cacheWrite;
          }
        } catch (e) {
          // Cache writes are opportunistic; never fail a successful PT-Gen response.
        }
      }
    } catch (e) {
      let err_return = {
        error: `Internal Error, Please contact @${getAuthor()}. Exception: ${e.message}`
      };

      if (uri.searchParams.get("debug") === '1') {
        err_return['debug'] = debug_get_err(e, request);
      }

      response = makeJsonResponse(err_return);
    }
  }

  return response;
}

function handleOptions(request) {
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null) {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
        "Access-Control-Allow-Headers": "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers"
      }
    })
  } else {
    return new Response(null, {
      headers: {
        "Allow": "GET, HEAD, OPTIONS",
      }
    })
  }
}

function makeIndexResponse() {
  return new Response(page, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    },
  });
}
