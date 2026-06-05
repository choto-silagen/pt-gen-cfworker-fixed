import {FETCH_BLOCKED_ERROR, fetchText, NONE_EXIST_ERROR, page_parser, safeArray, safeJsonParse} from "./common";

export async function search_imdb(query) {
  query = encodeURIComponent(query.toLowerCase());
  const imdb_search = await fetch(`https://v2.sg.media-imdb.com/suggestion/${query.slice(0, 1)}/${query}.json`)
  const imdb_search_json = await imdb_search.json();
  return {
    success: true,
    data: (imdb_search_json.d || []).filter(d => {
      return /^tt/.test(d.id)
    }).map(d => {
      return {
        year: d.y,
        subtype: d.q,
        title: d.l,
        link: `https://www.imdb.com/title/${d.id}`
      }
    })
  }
}

export async function gen_imdb(sid) {
  const data = {
    site: "imdb",
    sid: sid
  };

  if (sid.startsWith("tt")) {
    sid = sid.slice(2);
  }

  const imdb_id = "tt" + sid.padStart(7, "0");
  const imdb_url = `https://www.imdb.com/title/${imdb_id}/`;
  const {response: imdb_page_resp, text: imdb_page_raw} = await fetchText(imdb_url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (imdb_page_resp.status === 404 || imdb_page_raw.match(/404 Error - IMDb/)) {
    return Object.assign(data, {
      error: NONE_EXIST_ERROR
    });
  }

  const $ = page_parser(imdb_page_raw);
  const ld_raw = $('script[type="application/ld+json"]').html();
  if (!ld_raw) {
    return Object.assign(data, {
      error: imdb_page_resp.status === 202 || imdb_page_raw.match(/awsWaf|gokuProps|captcha/i)
        ? FETCH_BLOCKED_ERROR
        : "Unable to parse IMDb page."
    });
  }

  const page_json = safeJsonParse(ld_raw.replace(/\n/ig, ''), {});
  if (!page_json.name) {
    return Object.assign(data, {
      error: "Unable to parse IMDb page."
    });
  }

  data["imdb_id"] = imdb_id;
  data["imdb_link"] = imdb_url;

  const copy_items = ["@type", "name", "genre", "contentRating", "datePublished", "description", "duration"];
  for (let i = 0; i < copy_items.length; i++) {
    const copy_item = copy_items[i];
    data[copy_item] = page_json[copy_item];
  }

  data["poster"] = page_json["image"];
  if (data["datePublished"]) {
    data["year"] = data["datePublished"].slice(0, 4);
  }

  const person_items = ["actor", "director", "creator"];
  for (let i = 0; i < person_items.length; i++) {
    const person_item = person_items[i];
    const item_persons = safeArray(page_json[person_item]).filter(d => d && d["@type"] === "Person");
    if (item_persons.length > 0) {
      data[person_item + "s"] = item_persons.map(d => ({name: d.name, url: d.url}));
    }
  }

  data["keywords"] = "keywords" in page_json ? page_json["keywords"].split(",").map(item => item.trim()).filter(Boolean) : [];
  const aggregate_rating = page_json["aggregateRating"] || {};
  data["imdb_votes"] = aggregate_rating["ratingCount"] || 0;
  data["imdb_rating_average"] = aggregate_rating["ratingValue"] || 0;
  data["imdb_rating"] = data["imdb_rating_average"] ? `${data["imdb_rating_average"]}/10 from ${data["imdb_votes"]} users` : "";

  const release_info = await fetchText(`${imdb_url}releaseinfo`, {
    headers: {Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9"}
  }).catch(() => null);
  data["release_date"] = [];
  data["aka"] = [];
  if (release_info && release_info.text) {
    const release_page = page_parser(release_info.text);
    release_page("tr.release-date-item").each(function () {
      const row = release_page(this);
      const country = row.find("td.release-date-item__country-name").text().trim();
      const date = row.find("td.release-date-item__date").text().trim();
      if (country && date) data["release_date"].push({country, date});
    });
    release_page("tr.aka-item").each(function () {
      const row = release_page(this);
      const country = row.find("td.aka-item__name").text().trim();
      const title = row.find("td.aka-item__title").text().trim();
      if (country && title) data["aka"].push({country, title});
    });
  }

  let descr = data["poster"] ? `[img]${data["poster"]}[/img]\n\n` : "";
  descr += data["name"] ? `Title: ${data["name"]}\n` : "";
  descr += data["keywords"].length ? `Keywords: ${data["keywords"].join(", ")}\n` : "";
  descr += data["datePublished"] ? `Date Published: ${data["datePublished"]}\n` : "";
  descr += data["imdb_rating"] ? `IMDb Rating: ${data["imdb_rating"]}\n` : "";
  descr += `IMDb Link: ${data["imdb_link"]}\n`;
  descr += data["directors"] && data["directors"].length ? `Directors: ${data["directors"].map(i => i["name"]).join(" / ")}\n` : "";
  descr += data["creators"] && data["creators"].length ? `Creators: ${data["creators"].map(i => i["name"]).join(" / ")}\n` : "";
  descr += data["actors"] && data["actors"].length ? `Actors: ${data["actors"].map(i => i["name"]).join(" / ")}\n` : "";
  descr += data["description"] ? `\nIntroduction\n    ${data["description"].replace(/\n/g, "\n" + "　".repeat(2))}\n` : "";

  data["format"] = descr.trim();
  data["success"] = true;
  return data;
}
