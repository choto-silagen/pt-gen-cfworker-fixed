import {compactText, fetchJson, NONE_EXIST_ERROR, normalizeImageUrl} from "./common";

const tp_dict = {1: "漫画/小说", 2: "动画/二次元番", 3: "音乐", 4: "游戏", 6: "三次元番"};

function bangumiInit(init = {}) {
  return {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {})
    }
  };
}

function httpsImage(url) {
  return normalizeImageUrl(url).replace(/^http:/, "https:");
}

function formatInfoValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => compactText(item.v || item)).filter(Boolean).join(" / ");
  }
  if (value && typeof value === "object") {
    return compactText(value.v || JSON.stringify(value));
  }
  return compactText(value);
}

export async function search_bangumi(query) {
  const {json: bgm_search_json} = await fetchJson(
    `https://api.bgm.tv/search/subject/${encodeURIComponent(query)}?responseGroup=large`,
    bangumiInit()
  );

  const list = bgm_search_json.list || bgm_search_json.data || [];
  return {
    success: true,
    data: list.map(d => {
      return {
        year: (d['air_date'] || d['date'] || "").slice(0, 4),
        subtype: tp_dict[d['type']] || d['platform'] || "",
        title: d['name_cn'] !== '' ? d['name_cn'] : d['name'],
        subtitle: d['name'],
        link: d['url'] || `https://bgm.tv/subject/${d.id}`
      }
    })
  }
}

export async function gen_bangumi(sid) {
  const data = {
    site: "bangumi",
    sid: sid
  };

  const bangumi_link = `https://bgm.tv/subject/${sid}`;
  const [subject_result, characters_result, persons_result] = await Promise.all([
    fetchJson(`https://api.bgm.tv/v0/subjects/${sid}`, bangumiInit()).catch(error => ({error})),
    fetchJson(`https://api.bgm.tv/v0/subjects/${sid}/characters`, bangumiInit()).catch(() => null),
    fetchJson(`https://api.bgm.tv/v0/subjects/${sid}/persons`, bangumiInit()).catch(() => null)
  ]);

  if (subject_result && subject_result.error) {
    return Object.assign(data, {
      error: `Unable to reach Bangumi API: ${subject_result.error.message}`
    });
  }

  if (!subject_result || subject_result.response.status === 404 || !subject_result.json || subject_result.json.title === "Not Found") {
    return Object.assign(data, {
      error: NONE_EXIST_ERROR
    });
  }

  const subject = subject_result.json;
  const characters = Array.isArray((characters_result || {}).json) ? characters_result.json : [];
  const persons = Array.isArray((persons_result || {}).json) ? persons_result.json : [];

  data["alt"] = bangumi_link;
  data["name"] = subject.name || "";
  data["name_cn"] = subject.name_cn || "";
  data["cover"] = data["poster"] = httpsImage((subject.images || {}).large || (subject.images || {}).common || subject.image || "");
  data["story"] = compactText(subject.summary).replace(/\r\n/g, "\n");
  data["date"] = subject.date || "";
  data["platform"] = subject.platform || tp_dict[subject.type] || "";
  data["rank"] = subject.rank || "";
  data["bangumi_votes"] = ((subject.rating || {}).total || 0).toString();
  data["bangumi_rating_average"] = ((subject.rating || {}).score || 0).toString();
  data["tags"] = (subject.tags || []).map(tag => tag.name).filter(Boolean);
  data["info"] = (subject.infobox || []).map(item => `${item.key}: ${formatInfoValue(item.value)}`);
  data["staff"] = persons.map(item => `${item.relation}: ${item.name}`).filter(Boolean);
  if (data["staff"].length === 0) {
    data["staff"] = data["info"].filter(item => !/^(中文名|话数|放送开始|放送星期|别名|官方网站|播放电视台|其他电视台|Copyright)/.test(item));
  }
  data["cast"] = characters.map(item => {
    const actor_names = (item.actors || []).map(actor => actor.name).filter(Boolean).join("，");
    return `${item.name}${item.relation ? ` (${item.relation})` : ""}${actor_names ? `: ${actor_names}` : ""}`;
  });

  let descr = data["poster"] ? `[img]${data["poster"]}[/img]\n\n` : "";
  descr += data["name_cn"] ? `[b]Title: [/b]${data["name_cn"]}${data["name"] ? ` / ${data["name"]}` : ""}\n\n` : "";
  descr += data["story"] ? `[b]Story: [/b]\n\n${data["story"]}\n\n` : "";
  descr += data["info"].length ? `[b]Info: [/b]\n\n${data["info"].slice(0, 12).join("\n")}\n\n` : "";
  descr += data["staff"].length ? `[b]Staff: [/b]\n\n${data["staff"].slice(0, 15).join("\n")}\n\n` : "";
  descr += data["cast"].length ? `[b]Cast: [/b]\n\n${data["cast"].slice(0, 9).join("\n")}\n\n` : "";
  descr += data["tags"].length ? `[b]Tags: [/b]${data["tags"].slice(0, 12).join(" | ")}\n\n` : "";
  descr += `(来源于 ${data["alt"]} )\n`;

  data["format"] = descr.trim();
  data["success"] = true;
  return data;
}
