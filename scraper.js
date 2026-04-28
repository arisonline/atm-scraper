const puppeteer = require("puppeteer");
const fs = require("fs");

const BASE = "https://locate.pnb.bank.in";

// 🔹 Clean
function clean(t) {
  return t?.replace(/\s+/g, " ").trim() || "";
}

// 🔹 Extract ATM links from a page
async function extractLinks(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map(a => a.href)
      .filter(h => h.includes("/atm-") && h.includes("/Map"));
  });
}

// 🔹 Extract ATM data
async function extractATM(page) {
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

    return {
      name: document.querySelector("h1")?.innerText || "",
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

  // 🔥 START FROM ROOT PAGE
  await page.goto(BASE, { waitUntil: "networkidle2" });

  // 🔹 Step 1: collect STATE links
  const states = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map(a => a.href)
      .filter(h => h.includes("/Branches-in-") || h.includes("/atm-"));
  });

  console.log("States:", states.length);

  let atmUrls = [];

  // 🔹 Step 2: go deeper
  for (let stateUrl of states.slice(0, 5)) { // limit for free

    console.log("Visiting:", stateUrl);

    try {
      await page.goto(stateUrl, { waitUntil: "networkidle2" });

      const links = await extractLinks(page);
      atmUrls.push(...links);

    } catch {}

    await new Promise(r => setTimeout(r, 3000));
  }

  // 🔥 Deduplicate URLs
  atmUrls = [...new Set(atmUrls)];

  console.log("ATM URLs:", atmUrls.length);

  // 🔹 Step 3: scrape ATM pages
  const results = [];

  for (let url of atmUrls.slice(0, 20)) {

    console.log("Scraping:", url);

    try {
      await page.goto(url, { waitUntil: "networkidle2" });

      await new Promise(r => setTimeout(r, 3000));

      const data = await extractATM(page);

      if (!data.lat || !data.lng) continue;

      results.push({
        name: clean(data.name),
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        url
      });

    } catch {}

    await new Promise(r => setTimeout(r, 4000));
  }

  await browser.close();

  fs.writeFileSync("atms.json", JSON.stringify(results, null, 2));

  console.log("Saved:", results.length);

})();
