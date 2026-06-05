import {
  compactText,
  FETCH_BLOCKED_ERROR,
  fetchJson,
  fetchText,
  getEnv,
  NONE_EXIST_ERROR,
  normalizeImageUrl,
  page_parser
} from "./common";

/* global DOUBAN_COOKIE */

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

function fallbackTitle(raw, year) {
  const cleaned = compactText(raw)
    .replace(/\u200e/g, "")
    .replace(year ? new RegExp(`\\s*[（(]${year}[）)]\\s*$`) : /\s*[（(]\d{4}[）)]\s*$/, "")
    .trim();
  const cjk_prefix = cleaned.match(/^(.+?[\u4e00-\u9fff][^A-Za-z0-9]*)\s+[A-Za-z0-9]/);
  return cjk_prefix ? cjk_prefix[1].trim() : cleaned;
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

  const [mobile_result, abstract_result] = await Promise.all([
    fetchText(mobile_link, doubanFetchInit()).catch(() => null),
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
  const foreign_title = (original_title_raw || abstract_title.replace(abstract_chinese_title, ""))
    .replace(/[（(]\d{4}[）)]\s*$/, "")
    .replace(/\u200e/g, "")
    .trim();
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

  let descr = poster ? `[img]${poster}[/img]\n\n` : "";
  descr += data["trans_title"].length ? `◎译　　名　${data["trans_title"].join(" / ")}\n` : "";
  descr += data["this_title"].length ? `◎片　　名　${data["this_title"].join(" / ")}\n` : "";
  descr += year ? `◎年　　代　${year}\n` : "";
  descr += region.length ? `◎产　　地　${region.join(" / ")}\n` : "";
  descr += genre.length ? `◎类　　别　${genre.join(" / ")}\n` : "";
  descr += playdate.length ? `◎上映日期　${playdate.join(" / ")}\n` : "";
  descr += data["douban_rating"] ? `◎豆瓣评分　${data["douban_rating"]}\n` : "";
  descr += `◎豆瓣链接　${douban_link}\n`;
  descr += (subject && subject.episodes_count) ? `◎集　　数　${subject.episodes_count}\n` : "";
  descr += duration ? `◎片　　长　${duration}\n` : "";
  descr += data["director"].length ? `◎导　　演　${data["director"].map(x => x.name).join(" / ")}\n` : "";
  descr += data["cast"].length ? `◎主　　演　${data["cast"].map(x => x.name).join("\n" + "　".repeat(4) + "  　").trim()}\n` : "";
  descr += data["tags"].length ? `\n◎标　　签　${data["tags"].join(" | ")}\n` : "";
  descr += introduction ? `\n◎简　　介\n\n　　${introduction.replace(/\n/g, "\n" + "　".repeat(2))}\n` : "";

  data["format"] = descr.trim();
  data["success"] = true;
  return data;
}
