const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");

// 🔹 Clean text
function clean(text) {
  return text?.replace(/\s+/g, " ").trim() || "";
}

// 🔹 Step 1: Get URLs from Bing
async function getATMUrls() {
  let urls = [];

  for (let page = 0; page < 3; page++) { // pagination
    const searchUrl = `https://www.bing.com/search?q=site:locate.pnb.bank.in+ATM&first=${page * 10}`;

    console.log("Searching:", searchUrl);

    const res = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const matches = res.data.match(/https:\/\/locate\.pnb\.bank\.in\/[^\"]+/g);

    if (matches) urls.push(...matches);
  }

  return [...new Set(urls)];
}

// 🔹 Extract data from page
async function extractData(page, url) {
  return await page.evaluate(() => {

    let lat = "", lng = "";

    document.querySelectorAll("script").forEach(s => {
      const txt = s.innerText;

      const latMatch = txt.match(/latitude["']?\s*[:=]\s*["']?([0-9.\-]+)/i);
      const lngMatch = txt.match(/longitude["']?\s*[:=]\s*["']?([0-9.\-]+)/i);

      if (latMatch && lngMatch) {
        lat = latMatch[1];
        lng = lngMatch[1];
      }
    });

    const name = document.querySelector("h1")?.innerText || "";

    return {
      name,
      lat,
      lng
    };
  });
}

// 🔹 MAIN
(async () => {

  // Load old data
  let old = [];
  try {
    old = JSON.parse(fs.readFileSync("atms.json"));
  } catch {}

  // 🔥 Get URLs automatically
  const urls = await getATMUrls();

  console.log("Found URLs:", urls.length);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  const results = [];

  for (let url of urls.slice(0, 20)) { // limit free usage

    console.log("Scraping:", url);

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      await new Promise(r => setTimeout(r, 3000));

      const raw = await extractData(page, url);

      if (!raw.lat || !raw.lng) continue;

      results.push({
        name: clean(raw.name),
        lat: parseFloat(raw.lat),
        lng: parseFloat(raw.lng),
        url
      });

    } catch {
      console.log("Failed:", url);
    }

    await new Promise(r => setTimeout(r, 4000));
  }

  await browser.close();

  // 🔥 Deduplicate by lat/lng
  const merged = [...old, ...results].reduce((acc, cur) => {
    const key = cur.lat + "_" + cur.lng;
    acc[key] = cur;
    return acc;
  }, {});

  fs.writeFileSync("atms.json", JSON.stringify(Object.values(merged), null, 2));

  console.log("Saved:", Object.keys(merged).length);

})();
