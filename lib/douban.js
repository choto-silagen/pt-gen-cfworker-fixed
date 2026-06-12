import {
  compactText,
  FETCH_BLOCKED_ERROR,
  fetchJson,
  fetchText,
  getEnv,
  jsonp_parser,
  NONE_EXIST_ERROR,
  normalizeImageUrl,
  page_parser,
  safeJsonParse
} from "./common";

/* global DOUBAN_COOKIE */

const DOUBAN_MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function doubanFetchInit(init = {}) {
  const headers = {
    Accept: "text/html,application/json",
    ...(init.headers || {})
  };
  if (getEnv('DOUBAN_COOKIE')) {
    headers["Cookie"] = getEnv('DOUBAN_COOKIE');
  }
  return {
    ...init,
    headers
  };
}

function doubanRexxarInit(sid, init = {}) {
  return doubanFetchInit({
    ...init,
    headers: {
      Accept: "application/json",
      Referer: `https://m.douban.com/movie/subject/${sid}/`,
      "User-Agent": DOUBAN_MOBILE_UA,
      ...(init.headers || {})
    }
  });
}

function htmlToPlainText(html) {
  return (html || "")
    .replace(/<br\s*\/?>/ig, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map(compactText)
    .filter(Boolean)
    .join("\n");
}

function splitMeta(meta) {
  return compactText(meta)
    .split("/")
    .map(compactText)
    .filter(Boolean);
}

function personList(names) {
  return (names || []).map(name => ({name}));
}

function objectList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter(Boolean)
    .map(item => typeof item === "string" ? {name: item} : item);
}

function fallbackTitle(raw, year) {
  const cleaned = compactText(raw)
    .replace(/\u200e/g, "")
    .replace(year ? new RegExp(`\\s*[（(]${year}[）)]\\s*$`) : /\s*[（(]\d{4}[）)]\s*$/, "")
    .trim();
  const cjk_prefix = cleaned.match(/^(.+?[\u4e00-\u9fff][^A-Za-z0-9]*)\s+[A-Za-z0-9]/);
  return cjk_prefix ? cjk_prefix[1].trim() : cleaned;
}

function fetchAnchor(anchor) {
  const node = anchor && anchor[0];
  return compactText(node && node.nextSibling ? node.nextSibling.nodeValue : "");
}

function splitSlash(value) {
  return compactText(value)
    .split(/\s*\/\s*/)
    .map(compactText)
    .filter(Boolean);
}

function upgradedDoubanImage(url) {
  return normalizeImageUrl(url)
    .replace(/\?.+$/, "")
    .replace(/s(_ratio_poster|pic)/g, "l$1")
    .replace(/\/s_ratio_poster\//, "/l_ratio_poster/")
    .replace("img3", "img1");
}

function isDoubanBlocked(raw) {
  return !raw || raw.match(/检测到有异常请求|sec\.douban\.com|window\.location\.href\s*=\s*["']https:\/\/sec\.douban\.com/);
}

function getLdJson($) {
  const ld_raw = $('head > script[type="application/ld+json"]').html() ||
    $('script[type="application/ld+json"]').first().html();
  if (!ld_raw) return null;
  return safeJsonParse(ld_raw.replace(/(\r\n|\n|\r|\t)/gm, ''), null);
}

async function fetchImdbRating(imdb_id) {
  if (!imdb_id) return {};
  const imdb_result = await fetchText(
    `https://p.media-imdb.com/static-content/documents/v1/title/${imdb_id}/ratings%3Fjsonp=imdb.rating.run:imdb.api.title.ratings/data.json`
  ).catch(() => null);
  if (!imdb_result || !imdb_result.text) return {};

  const imdb_json = jsonp_parser(imdb_result.text);
  if (!imdb_json["resource"]) return {};

  const imdb_rating_average = imdb_json["resource"]["rating"] || 0;
  const imdb_votes = imdb_json["resource"]["ratingCount"] || 0;
  return {
    imdb_rating_average,
    imdb_votes,
    imdb_rating: imdb_rating_average ? `${imdb_rating_average}/10 from ${imdb_votes} users` : ""
  };
}

async function fetchAwards(douban_link) {
  const awards_result = await fetchText(`${douban_link}awards`, doubanFetchInit()).catch(() => null);
  if (!awards_result || !awards_result.text || isDoubanBlocked(awards_result.text)) return "";

  const awards_page = page_parser(awards_result.text);
  const awards_html = awards_page("#content > div > div.article").html();
  if (!awards_html) return "";

  return awards_html
    .replace(/[ \n]/g, "")
    .replace(/<\/li><li>/g, "</li> <li>")
    .replace(/<\/a><span/g, "</a> <span")
    .replace(/<(div|ul)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

function buildDoubanFormat(data) {
  const region = Array.isArray(data.region) ? data.region : splitSlash(data.region);
  const genre = Array.isArray(data.genre) ? data.genre : splitSlash(data.genre);
  const language = Array.isArray(data.language) ? data.language : splitSlash(data.language);
  const playdate = Array.isArray(data.playdate) ? data.playdate : splitSlash(data.playdate);
  const trans_title = Array.isArray(data.trans_title) ? data.trans_title : splitSlash(data.trans_title);
  const this_title = Array.isArray(data.this_title) ? data.this_title : splitSlash(data.this_title);

  let descr = data.poster ? `[img]${data.poster}[/img]\n\n` : "";
  descr += trans_title.length ? `◎译　　名　${trans_title.join(" / ")}\n` : "";
  descr += this_title.length ? `◎片　　名　${this_title.join(" / ")}\n` : "";
  descr += data.year ? `◎年　　代　${compactText(data.year)}\n` : "";
  descr += region.length ? `◎产　　地　${region.join(" / ")}\n` : "";
  descr += genre.length ? `◎类　　别　${genre.join(" / ")}\n` : "";
  descr += language.length ? `◎语　　言　${language.join(" / ")}\n` : "";
  descr += playdate.length ? `◎上映日期　${playdate.join(" / ")}\n` : "";
  descr += data.imdb_rating ? `◎IMDb评分  ${data.imdb_rating}\n` : "";
  descr += data.imdb_link ? `◎IMDb链接  ${data.imdb_link}\n` : "";
  descr += data.douban_rating ? `◎豆瓣评分　${data.douban_rating}\n` : "";
  descr += data.douban_link ? `◎豆瓣链接　${data.douban_link}\n` : "";
  descr += data.episodes ? `◎集　　数　${data.episodes}\n` : "";
  descr += data.duration ? `◎片　　长　${data.duration}\n` : "";
  descr += data.director && data.director.length > 0 ? `◎导　　演　${data.director.map(x => x.name).filter(Boolean).join(" / ")}\n` : "";
  descr += data.writer && data.writer.length > 0 ? `◎编　　剧　${data.writer.map(x => x.name).filter(Boolean).join(" / ")}\n` : "";
  descr += data.cast && data.cast.length > 0 ? `◎主　　演　${data.cast.map(x => x.name).filter(Boolean).join("\n" + "　".repeat(4) + "  　").trim()}\n` : "";
  descr += data.tags && data.tags.length > 0 ? `\n◎标　　签　${data.tags.join(" | ")}\n` : "";
  descr += data.introduction ? `\n◎简　　介\n\n　　${data.introduction.replace(/\n/g, "\n" + "　".repeat(2))}\n` : "";
  descr += data.awards ? `\n◎获奖情况\n\n　　${data.awards.replace(/\n/g, "\n" + "　".repeat(2))}\n` : "";
  return descr.trim();
}

async function parseDesktopDouban(data, douban_link, douban_page_raw) {
  if (isDoubanBlocked(douban_page_raw)) return null;

  const $ = page_parser(douban_page_raw);
  const ld_json = getLdJson($);
  if (!ld_json || !ld_json.name || $("title").text().trim() === "豆瓣") return null;

  const title = $("title").text().replace("(豆瓣)", "").trim();
  const chinese_title = title || compactText(ld_json.name);
  const item_reviewed = $('span[property="v:itemreviewed"]').text().replace(chinese_title, "").trim();
  const foreign_title = item_reviewed && item_reviewed !== chinese_title ? item_reviewed : "";

  const aka_anchor = $('#info span.pl:contains("又名")');
  const aka = aka_anchor.length > 0
    ? splitSlash(fetchAnchor(aka_anchor)).sort((a, b) => a.localeCompare(b))
    : [];

  const trans_title = foreign_title ? [chinese_title, ...aka] : aka;
  const this_title = foreign_title ? [foreign_title] : [chinese_title].filter(Boolean);
  const regions_anchor = $('#info span.pl:contains("制片国家/地区")');
  const language_anchor = $('#info span.pl:contains("语言")');
  const episodes_anchor = $('#info span.pl:contains("集数")');
  const duration_anchor = $('#info span.pl:contains("单集片长")');
  const imdb_anchor = $('#info span.pl:contains("IMDb")');

  const year = $("#content > h1 > span.year").text().substr(1, 4);
  const region = regions_anchor.length > 0 ? splitSlash(fetchAnchor(regions_anchor)) : [];
  const genre = $("#info span[property=\"v:genre\"]").map(function () {
    return $(this).text().trim();
  }).toArray();
  const language = language_anchor.length > 0 ? splitSlash(fetchAnchor(language_anchor)) : [];
  const playdate = $("#info span[property=\"v:initialReleaseDate\"]").map(function () {
    return $(this).text().trim();
  }).toArray().sort((a, b) => new Date(a) - new Date(b));
  const episodes = episodes_anchor.length > 0 ? fetchAnchor(episodes_anchor) : "";
  const duration = duration_anchor.length > 0 ? fetchAnchor(duration_anchor) : $("#info span[property=\"v:runtime\"]").text().trim();
  const introduction_another = $('#link-report-intra > span.all.hidden, #link-report-intra > [property="v:summary"], #link-report > span.all.hidden, #link-report > [property="v:summary"]');
  const introduction = (
    introduction_another.length > 0 ? introduction_another.text() : '暂无相关剧情介绍'
  ).split('\n').map(a => a.trim()).filter(a => a.length > 0).join('\n');
  const aggregate_rating = ld_json['aggregateRating'] || {};
  const douban_rating_average = aggregate_rating['ratingValue'] || 0;
  const douban_votes = aggregate_rating['ratingCount'] || 0;
  const poster = upgradedDoubanImage(ld_json['image']);
  const imdb_id = imdb_anchor.length > 0 ? fetchAnchor(imdb_anchor) : "";
  const tags = $('div.tags-body > a[href^="/tag"]').map(function () {
    return $(this).text().trim();
  }).get().filter(Boolean);

  Object.assign(data, {
    chinese_title,
    foreign_title,
    trans_title,
    this_title,
    aka,
    year: year ? " " + year : "",
    region,
    genre,
    language,
    playdate,
    episodes,
    duration,
    introduction,
    douban_rating_average,
    douban_votes,
    douban_rating: douban_rating_average ? `${douban_rating_average}/10 from ${douban_votes} users` : "",
    douban_link,
    poster,
    director: objectList(ld_json['director']),
    writer: objectList(ld_json['author']),
    cast: objectList(ld_json['actor']),
    tags
  });

  if (imdb_id) {
    data["imdb_id"] = imdb_id;
    data["imdb_link"] = `https://www.imdb.com/title/${imdb_id}/`;
    Object.assign(data, await fetchImdbRating(imdb_id));
  }

  data["awards"] = await fetchAwards(douban_link);
  data["format"] = buildDoubanFormat(data);
  data["success"] = true;
  return data;
}

function personName(item) {
  return typeof item === "string" ? item : item && item.name;
}

function peopleFromCredits(credits, matcher) {
  return (credits || [])
    .filter(item => matcher(item))
    .map(item => ({name: item.name, url: item.url}))
    .filter(item => item.name);
}

async function parseRexxarDouban(data, sid, douban_link) {
  const [subject_result, credits_result] = await Promise.all([
    fetchJson(`https://m.douban.com/rexxar/api/v2/movie/${sid}`, doubanRexxarInit(sid)).catch(() => null),
    fetchJson(`https://m.douban.com/rexxar/api/v2/movie/${sid}/credits`, doubanRexxarInit(sid)).catch(() => null)
  ]);

  if (!subject_result || subject_result.response.status === 404) return null;
  if (subject_result.response.status >= 400 || !subject_result.json || !subject_result.json.title) return null;

  const subject = subject_result.json;
  const credits = credits_result && Array.isArray((credits_result.json || {}).items)
    ? credits_result.json.items
    : [];
  const title = compactText(subject.title);
  const foreign_title = compactText(subject.original_title);
  const aka = Array.isArray(subject.aka) ? subject.aka.map(compactText).filter(Boolean) : [];
  const rating = subject.rating || {};
  const poster = upgradedDoubanImage(
    (subject.pic || {}).large ||
    (subject.pic || {}).normal ||
    subject.cover_url ||
    (typeof subject.cover === "string" ? subject.cover : (subject.cover || {}).url)
  );
  const directors = objectList(subject.directors);
  const writers = peopleFromCredits(credits, item =>
    item.category === "编剧" || /^编剧/.test(item.character || "")
  );
  const actors = objectList(subject.actors);
  const tags = (subject.tags || [])
    .map(tag => personName(tag) || tag.title || tag)
    .map(compactText)
    .filter(Boolean);

  Object.assign(data, {
    chinese_title: title,
    foreign_title,
    trans_title: foreign_title ? [title, ...aka] : aka,
    this_title: [foreign_title || title].filter(Boolean),
    aka,
    year: subject.year ? " " + subject.year : "",
    region: Array.isArray(subject.countries) ? subject.countries : [],
    genre: Array.isArray(subject.genres) ? subject.genres : [],
    language: Array.isArray(subject.languages) ? subject.languages : [],
    playdate: Array.isArray(subject.pubdate) ? subject.pubdate : [],
    episodes: subject.episodes_count ? String(subject.episodes_count) : "",
    duration: Array.isArray(subject.durations) ? subject.durations.join(" / ") : "",
    introduction: compactText(subject.intro).replace(/\r\n/g, "\n") || "暂无相关剧情介绍",
    douban_rating_average: rating.value || 0,
    douban_votes: rating.count || 0,
    douban_rating: rating.value ? `${rating.value}/10 from ${rating.count || 0} users` : "",
    douban_link,
    poster,
    director: directors.length ? directors : peopleFromCredits(credits, item => item.category === "导演" || /导演/.test(item.character || "")),
    writer: writers,
    cast: actors.length ? actors : peopleFromCredits(credits, item => item.category === "演员" || /演员/.test(item.character || "")),
    tags
  });

  data["awards"] = await fetchAwards(douban_link);
  data["format"] = buildDoubanFormat(data);
  data["success"] = true;
  return data;
}

export async function search_douban(query) {
  const {json: douban_search_json} = await fetchJson(
    `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(query)}`,
    doubanFetchInit({headers: {Accept: "application/json"}})
  );

  return {
    success: true,
    data: (Array.isArray(douban_search_json) ? douban_search_json : []).map(d => {
      return {
        year: d.year,
        subtype: d.type,
        title: d.title,
        subtitle: d.sub_title,
        link: `https://movie.douban.com/subject/${d.id}/`
      }
    })
  }
}

export async function gen_douban(sid) {
  const data = {
    site: "douban",
    sid: sid
  };

  const douban_link = `https://movie.douban.com/subject/${sid}/`;
  const mobile_link = `https://m.douban.com/movie/subject/${sid}/`;
  const abstract_link = `https://movie.douban.com/j/subject_abstract?subject_id=${sid}`;

  const desktop_result = await fetchText(douban_link, doubanFetchInit()).catch(() => null);
  const desktop_raw = desktop_result ? desktop_result.text : "";
  if ((desktop_result && desktop_result.response.status === 404) || (desktop_raw && desktop_raw.match(/你想访问的页面不存在/))) {
    return Object.assign(data, {
      error: NONE_EXIST_ERROR
    });
  }

  const desktop_data = await parseDesktopDouban(data, douban_link, desktop_raw);
  if (desktop_data) return desktop_data;

  const rexxar_data = await parseRexxarDouban(data, sid, douban_link);
  if (rexxar_data) return rexxar_data;

  const [mobile_result, abstract_result] = await Promise.all([
    fetchText(mobile_link, doubanFetchInit({headers: {"User-Agent": DOUBAN_MOBILE_UA}})).catch(() => null),
    fetchJson(abstract_link, doubanFetchInit({headers: {Accept: "application/json"}})).catch(() => null)
  ]);

  const mobile_raw = mobile_result ? mobile_result.text : "";
  const abstract_json = abstract_result ? abstract_result.json : {};
  const subject = abstract_json && abstract_json.r === 0 ? abstract_json.subject : null;

  if ((mobile_result && mobile_result.response.status === 404) || (mobile_raw && mobile_raw.match(/页面不存在|你想访问的页面不存在/))) {
    return Object.assign(data, {
      error: NONE_EXIST_ERROR
    });
  }

  if (!subject && (!mobile_raw || mobile_raw.match(/检测到有异常请求|sec\.douban\.com/))) {
    return Object.assign(data, {
      error: FETCH_BLOCKED_ERROR
    });
  }

  const $ = page_parser(mobile_raw);
  const meta = splitMeta($(".sub-meta").text());
  const meta_description = compactText($('meta[name="description"], meta[itemprop="description"]').first().attr("content"));
  const abstract_title = compactText((subject || {}).title || "");
  const abstract_year = (subject && subject.release_year) || (abstract_title.match(/\d{4}/) || [""])[0];
  const abstract_chinese_title = fallbackTitle(abstract_title, abstract_year);

  const chinese_title = compactText($(".sub-title").text()) || abstract_chinese_title;
  const original_title_raw = compactText($(".sub-original-title").text());
  const parsed_foreign_title = (original_title_raw || abstract_title.replace(abstract_chinese_title, ""))
    .replace(/[（(]\d{4}[）)]\s*$/, "")
    .replace(/\u200e/g, "")
    .trim();
  const foreign_title = parsed_foreign_title && parsed_foreign_title !== chinese_title ? parsed_foreign_title : "";
  const poster = normalizeImageUrl(
    $(".sub-cover img").attr("src") ||
    $('meta[itemprop="image"]').attr("content") ||
    $('meta[property="og:image"]').attr("content")
  ).replace(/\?.+$/, "").replace(/\/s_ratio_poster\//, "/l_ratio_poster/");

  const genre = (subject && subject.types) ? subject.types : meta.filter(item => !item.match(/上映|片长|\d{4}/)).slice(1);
  const region = subject && subject.region ? subject.region.split(/\s*\/\s*/) : (meta.length ? [meta[0]] : []);
  const playdate = meta.filter(item => item.match(/上映/)).map(item => item.replace(/上映$/, ""));
  const duration = (subject && subject.duration) || (meta.find(item => item.match(/^片长/)) || "").replace(/^片长/, "");
  const year = abstract_year || (original_title_raw.match(/\d{4}/) || [""])[0];
  const introduction = htmlToPlainText($(".subject-intro .bd p").html()) ||
    meta_description.replace(/^.+?简介[：:]/, "").trim() ||
    "暂无相关剧情介绍";
  const douban_average_rating = (subject && subject.rate) || $('meta[itemprop="ratingValue"]').attr("content") || 0;
  const douban_votes = $('meta[itemprop="reviewCount"]').attr("content") || 0;

  data["chinese_title"] = chinese_title;
  data["foreign_title"] = foreign_title;
  data["trans_title"] = foreign_title ? [chinese_title] : [];
  data["this_title"] = [foreign_title || chinese_title].filter(Boolean);
  data["year"] = year ? " " + year : "";
  data["region"] = region;
  data["genre"] = genre;
  data["language"] = [];
  data["playdate"] = playdate;
  data["duration"] = duration;
  data["introduction"] = introduction;
  data["douban_rating_average"] = douban_average_rating;
  data["douban_votes"] = douban_votes;
  data["douban_rating"] = douban_average_rating ? `${douban_average_rating}/10 from ${douban_votes} users` : "";
  data["douban_link"] = douban_link;
  data["poster"] = poster;
  data["director"] = personList((subject || {}).directors);
  data["writer"] = [];
  data["cast"] = personList((subject || {}).actors);
  data["tags"] = ($('meta[name="keywords"]').attr("content") || "")
    .split(",")
    .map(compactText)
    .filter(item => item && !item.match(/豆瓣评分|影评|预告片|电影剧照|剧情介绍|演职员表/));

  data["format"] = buildDoubanFormat(data);
  data["success"] = true;
  return data;
}
