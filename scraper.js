const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const zlib = require("zlib");

// 🔹 STEP 1: Get sitemap links
async function getSitemapLinks() {
  const sitemap = "https://locate.pnb.bank.in/sitemap.xml";

  const res = await axios.get(sitemap);
  const matches = res.data.match(/https:[^<]+\.xml\.gz/g);

  return matches.slice(0, 3); // limit for testing
}

// 🔹 STEP 2: Extract ATM URLs
async function getATMUrlsFromGZ(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });

  const xml = zlib.gunzipSync(res.data).toString("utf-8");

  const matches = xml.match(/https:[^<]+/g) || [];

  return matches.filter(u =>
    u.includes("-atm-") && u.endsWith("/Home")
  );
}

// 🔹 STEP 3: Collect all ATM URLs
async function collectAllATMUrls() {
  const sitemapLinks = await getSitemapLinks();

  let all = [];

  for (let link of sitemapLinks) {
    console.log("Reading:", link);

    const urls = await getATMUrlsFromGZ(link);

    all.push(...urls);
  }

  return [...new Set(all)];
}

// 🔹 Deduplicate ATM data
function uniqueByLatLng(data) {
  const map = new Map();
  data.forEach(d => {
    const key = `${d.lat}_${d.lng}`;
    map.set(key, d);
  });
  return [...map.values()];
}

// 🔹 Scrape ATM page
async function scrapePage(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    await new Promise(r => setTimeout(r, 3000));

   const data = await page.evaluate(() => {

  let lat = "", lng = "";

  // 🔹 LAT LNG
  document.querySelectorAll("script").forEach(s => {
    const txt = s.innerText;

    const latMatch = txt.match(/latitude["']?\s*[:=]\s*["']?([0-9.\-]+)/i);
    const lngMatch = txt.match(/longitude["']?\s*[:=]\s*["']?([0-9.\-]+)/i);

    if (latMatch && lngMatch) {
      lat = latMatch[1];
      lng = lngMatch[1];
    }
  });

  // 🔹 NAME
  const name = document.querySelector("h1")?.innerText.trim() || "";

  // 🔹 CLEAN TEXT
  const lines = document.body.innerText
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 2);

  let address = [];
  let pincode = "";
  let phone = "";
  let email = "";
  let landmark = "";

  for (let line of lines) {

    // 📍 PINCODE
    const pin = line.match(/\b\d{6}\b/);
    if (pin) {
      pincode = pin[0];
      address.push(line);
      continue;
    }

    // 📞 PHONE
    if (line.match(/\+91\d+/) || line.includes("1800")) {
      phone = line;
      continue;
    }

    // 📧 EMAIL
    if (line.includes("[at]")) {
      email = line;
      continue;
    }

    // 📌 LANDMARK
    if (line.toLowerCase().includes("near") || line.toLowerCase().includes("above")) {
      landmark = line;
      continue;
    }

    // 📍 ADDRESS (smart filter)
    if (
      line.toLowerCase().includes("road") ||
      line.toLowerCase().includes("floor") ||
      line.toLowerCase().includes("west bengal") ||
      line.toLowerCase().includes("alipurduar") ||
      line.toLowerCase().includes("jaygaon")
    ) {
      address.push(line);
    }
  }

  return {
    name,
    lat,
    lng,
    address: address.join(", "),
    pincode,
    phone,
    email,
    landmark
  };
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

  console.log("🔄 Collecting URLs...");

  const urls = await collectAllATMUrls();

  console.log("Total URLs:", urls.length);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  let oldData = [];
  try {
    oldData = JSON.parse(fs.readFileSync("atms.json"));
  } catch {}

  const results = [];

  for (let url of urls.slice(0, 20)) {
    console.log("Scraping:", url);

    const data = await scrapePage(page, url);

    if (data) results.push(data);

    await new Promise(r => setTimeout(r, 4000));
  }

  await browser.close();

  const merged = uniqueByLatLng([...oldData, ...results]);

  fs.writeFileSync("atms.json", JSON.stringify(merged, null, 2));

  console.log("✅ Saved:", merged.length);

})();
