const puppeteer = require("puppeteer");
const fs = require("fs");

// 🔹 Clean text
function clean(text) {
  return text?.replace(/\s+/g, " ").trim() || "";
}

// 🔹 Extract ATM data properly
async function extractData(page, url) {

  return await page.evaluate(() => {

    function getText(selector) {
      return document.querySelector(selector)?.innerText || "";
    }

    function findLatLng() {
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

      return { lat, lng };
    }

    const { lat, lng } = findLatLng();

    return {
      name: getText("h1"),
      address: getText("body"), // full raw (we clean outside)
      lat,
      lng
    };
  });
}

// 🔹 MAIN
(async () => {

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  const base = "https://locate.pnb.bank.in";

  // 🔥 AUTO URL DISCOVERY (pagination simulation)
  let urls = [];

  for (let i = 1; i <= 3; i++) {   // increase later
    const searchUrl = `${base}/?page=${i}`;

    console.log("Scanning:", searchUrl);

    try {
      await page.goto(searchUrl, { waitUntil: "networkidle2" });

      const found = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map(a => a.href)
          .filter(h => h.includes("/atm-") && h.includes("/Map"));
      });

      urls.push(...found);

    } catch {}
  }

  // 🔥 Remove duplicates
  urls = [...new Set(urls)];

  console.log("Total URLs:", urls.length);

  // 🔹 Load old data
  let old = [];
  try {
    old = JSON.parse(fs.readFileSync("atms.json"));
  } catch {}

  const results = [];

  for (let url of urls.slice(0, 20)) { // limit for free run

    console.log("Scraping:", url);

    try {
      await page.goto(url, { waitUntil: "networkidle2" });

      await new Promise(r => setTimeout(r, 3000));

      const raw = await extractData(page, url);

      if (!raw.lat || !raw.lng) continue;

      results.push({
        name: clean(raw.name),
        lat: parseFloat(raw.lat),
        lng: parseFloat(raw.lng),
        address: clean(raw.address).slice(0, 200),
        url
      });

    } catch {}

    await new Promise(r => setTimeout(r, 4000));
  }

  await browser.close();

  // 🔥 Merge + deduplicate
  const final = [...old, ...results].reduce((acc, cur) => {
    const key = cur.lat + "_" + cur.lng;
    acc[key] = cur;
    return acc;
  }, {});

  fs.writeFileSync("atms.json", JSON.stringify(Object.values(final), null, 2));

  console.log("Saved:", Object.keys(final).length);

})();
