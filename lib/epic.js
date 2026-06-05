import {fetchJson, NONE_EXIST_ERROR} from "./common";

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== "") || "";
}

function imageList(items) {
  return (items || []).map(item => {
    if (typeof item === "string") return item;
    return firstValue(item.src, item.url, (item.image || {}).src, (item.media || {}).src);
  }).filter(Boolean);
}

export async function gen_epic(sid) {
  const data = {
    site: "epic",
    sid: sid
  };

  const {response: epic_api_resp, json: epic_api_json} = await fetchJson(`https://store-content.ak.epicgames.com/api/zh-CN/content/products/${sid}`);
  if (epic_api_resp.status === 404 || !epic_api_json) {
    return Object.assign(data, {
      error: NONE_EXIST_ERROR
    });
  }

  const pages = epic_api_json.pages || [epic_api_json];
  const page = pages.find(item => item && (item._slug === sid || (item._urlPattern || "").includes(`/${sid}`))) || pages[0] || epic_api_json;
  const page_data = page.data || {};
  const about = page_data.about || {};
  const hero = page_data.hero || {};
  const gallery = page_data.gallery || {};
  const requirements = page_data.requirements || {};

  data["name"] = firstValue(page["productName"], epic_api_json["productName"], page["_title"], sid);
  data["epic_link"] = `https://store.epicgames.com/zh-CN/p/${sid}`;
  data["desc"] = firstValue(about["description"], about["shortDescription"], page["description"]);
  data["poster"] = data["logo"] = firstValue((hero["logoImage"] || {}).src, (about["image"] || {}).src, hero["backgroundImageUrl"], hero["portraitBackgroundImageUrl"]);
  data["screenshot"] = imageList(gallery["galleryImages"] || gallery["images"] || gallery["media"]);

  const languages = [];
  for (const lang of (requirements["languages"] || [])) {
    if (lang.search(':') === -1 && lang.search("：") === -1 && languages.length) {
      languages[languages.length - 1] += `、${lang}`;
    } else if (lang.search('-') > -1) {
      lang.split('-').forEach(item => languages.push(item.trim()));
    } else {
      languages.push(lang);
    }
  }
  data["language"] = languages.filter(Boolean);

  data["min_req"] = {};
  data["max_req"] = {};
  (requirements["systems"] || []).forEach(function (i) {
    const systemType = i["systemType"] || "System";
    const details = i["details"] || [];
    data["min_req"][systemType] = details.map(x => `${x["title"]}: ${x["minimum"] || ''}`).filter(line => !line.endsWith(": "));
    data["max_req"][systemType] = details.map(x => `${x["title"]}: ${x["recommended"] || ''}`).filter(line => !line.endsWith(": "));
  });
  data["level"] = imageList(requirements["legalTags"]);

  let descr = data["logo"] ? `[img]${data["logo"]}[/img]\n\n` : "";
  descr += "【基本信息】\n\n";
  descr += data["name"] ? `游戏名称：${data["name"]}\n` : "";
  descr += data["epic_link"] ? `商店链接：${data["epic_link"]}\n` : "";
  descr += "\n";
  descr += data["language"].length ? `【支持语言】\n\n${data["language"].join("\n")}\n\n` : "";
  descr += data["desc"] ? `【游戏简介】\n\n${data["desc"]}\n\n` : "";

  const req_list = {
    "min_req": "【最低配置】",
    "max_req": "【推荐配置】"
  };
  for (let req in req_list) {
    if (Object.entries(data[req]).length === 0) continue;
    descr += `${req_list[req]}\n\n`;
    for (let system in data[req]) {
      if (data[req][system].length === 0) continue;
      descr += `${system}\n${data[req][system].join("\n")}\n`;
    }
    descr += "\n\n";
  }
  descr += data["screenshot"].length ? `【游戏截图】\n\n${data["screenshot"].map(x => `[img]${x}[/img]`).join("\n")}\n\n` : "";
  descr += data["level"].length ? `【游戏评级】\n\n${data["level"].map(x => `[img]${x}[/img]`).join("\n")}\n\n` : "";

  data["format"] = descr.trim();
  data["success"] = true;
  return data;
}
