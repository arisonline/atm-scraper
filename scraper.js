const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");

// 🔹 Load URLs
let urls = [];
try {
  urls = JSON.parse(fs.readFileSync("urls.json"));
} catch {}

// 🔹 Load old ATM data
let atms = [];
try {
  atms = JSON.parse(fs.readFileSync("atms.json"));
} catch {}

// 🔹 Deduplicate helper
function uniqueByLatLng(data) {
  const map = new Map();
  data.forEach(d => {
    const key = `${d.lat}_${d.lng}`;
    map.set(key, d);
  });
  return [...map.values()];
}

// 🔹 Scrape single page
async function scrapePage(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {

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

  // ✅ Clean name
  const name = document.querySelector("h1")?.innerText.trim() || "";

  // ✅ Clean address (target only real section)
  let address = "";

  const labels = Array.from(document.querySelectorAll("*"));

  labels.forEach(el => {
    if (el.innerText?.includes("Address")) {
      address = el.innerText.replace("Address", "").trim();
    }
  });

  return { name, lat, lng, address };
});

    if (data.lat && data.lng) {
      return {
        name: data.name,
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        address: data.address,
        url
      };
    }

  } catch (e) {
    console.log("Error:", url);
  }

  return null;
}

// 🔹 MAIN
(async () => {

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  const results = [];

  for (let url of urls.slice(0, 20)) { // limit for free run
    console.log("Scraping:", url);

    const data = await scrapePage(page, url);

    if (data) results.push(data);

    await new Promise(r => setTimeout(r, 4000)); // avoid block
  }

  await browser.close();

  const merged = uniqueByLatLng([...atms, ...results]);

  fs.writeFileSync("atms.json", JSON.stringify(merged, null, 2));

  console.log("Saved:", merged.length);

})();
