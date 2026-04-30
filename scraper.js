const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const zlib = require("zlib");

// ===============================
// STEP 1: Load sitemap
// ===============================
async function getSitemapLinks() {
  const res = await axios.get("https://locate.pnb.bank.in/sitemap.xml");
  // remove slice completely
  return res.data.match(/https:[^<]+\.xml\.gz/g) || [];
}

// ===============================
// STEP 2: Extract URLs
// ===============================
async function getATMUrlsFromGZ(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const xml = zlib.gunzipSync(res.data).toString("utf-8");

  const urls = xml.match(/https:[^<]+/g) || [];

  return urls.filter(u =>
    u.includes("punjab-national-bank") &&
    u.endsWith("/Home")
  );
}

// ===============================
// STEP 3: Collect all URLs
// ===============================
async function collectAllATMUrls() {
  const maps = await getSitemapLinks();

  console.log("🧭 Sitemaps found:", maps.length); // ✅ ADD HERE

  let all = [];
  for (let m of maps) {
  try {
    const urls = await getATMUrlsFromGZ(m);
    all.push(...urls);
  } catch (e) {
    console.log("❌ Sitemap failed:", m);
  }
}

  return [...new Set(all)];
}

// ===============================
// STEP 4: Scraper
// ===============================
async function scrapePage(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    await new Promise(r => setTimeout(r, 2500));

    const data = await page.evaluate(() => {

  let lat = "", lng = "";

  // 🔹 LAT LNG
  document.querySelectorAll("script").forEach(s => {
    const txt = s.innerText;

    const latMatch = txt.match(/latitude.*?([0-9.\-]+)/i);
    const lngMatch = txt.match(/longitude.*?([0-9.\-]+)/i);

    if (latMatch && lngMatch) {
      lat = latMatch[1];
      lng = lngMatch[1];
    }
  });

  const name = document.querySelector("h1")?.innerText.trim() || "";

  // 🔥 CLEAN LINES
  const lines = document.body.innerText
    .split("\n")
    .map(l => l.trim())
    .filter(l =>
      l.length > 2 &&
      !l.toLowerCase().includes("submit a review") &&
      !l.toLowerCase().includes("read reviews") &&
      !l.toLowerCase().includes("branches near") &&
      !l.toLowerCase().includes("branches in") &&
      !l.toLowerCase().includes("click here") &&
      !l.toLowerCase().includes("scan this qr")
    );

  let address = "";
  let pincode = "";
  let phone = "";
  let ifsc = "";
  let landmark = "";

  // =========================
  // 📍 PINCODE (anchor)
  // =========================
  let pinIndex = lines.findIndex(l => /\b\d{6}\b/.test(l));

  if (pinIndex !== -1) {
    const pinMatch = lines[pinIndex].match(/\b\d{6}\b/);
    pincode = pinMatch ? pinMatch[0] : "";

    // 🔥 address = only valid lines
    const raw = lines.slice(Math.max(0, pinIndex - 3), pinIndex + 1);

    const clean = raw.filter(l =>
      !l.toLowerCase().includes("punjab national bank") &&
      !l.match(/^\d+(\.\d+)?$/) // remove "2.7"
    );

    address = clean.join(", ");
  }

      

// =========================
// 📞 PHONE (ULTIMATE FIX)
// =========================



// 🔹 FULL PAGE TEXT (stronger than innerText)
const fullText = document.body.innerText + " " + document.body.textContent;

// 1️⃣ Priority: Branch Head pattern
const branchMatch = fullText.match(
  /branch head[^+0-9]*([+]91\d{10}|91\d{10}|\b\d{10}\b)/i
);

if (branchMatch) {
  phone = branchMatch[1];
}

// 2️⃣ Fallback: any Indian number
if (!phone) {
  const anyMatch = fullText.match(/([+]91\d{10}|91\d{10}|\b\d{10}\b)/);

  if (anyMatch) {
    const num = anyMatch[1];

    if (!num.startsWith("1800")) {
      phone = num;
    }
  }
}

// 3️⃣ Normalize
if (phone.startsWith("91") && !phone.startsWith("+91")) {
  phone = "+" + phone;
}
      

  // =========================
  // 🔢 IFSC
  // =========================
  const ifscMatch = document.body.innerText.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/);
  if (ifscMatch) ifsc = ifscMatch[0];

  // =========================
  // 📌 LANDMARK (STRICT)
  // =========================
  const landmarkLine = lines.find(l =>
    (
      l.toLowerCase().includes("near ") ||
      l.toLowerCase().includes("beside ") ||
      l.toLowerCase().includes("above ")
    ) &&
    !l.toLowerCase().includes("branches") &&
    !l.toLowerCase().includes("atm")
  );

  if (landmarkLine) landmark = landmarkLine;

  return {
    name,
    lat,
    lng,
    address,
    pincode,
    phone,
    ifsc,
    landmark
  };
});

    

    
    if (data.lat && data.lng) {
      return {
        ...data,
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        url,
        updatedAt: Date.now() // ✅ ADD
      };
    }

  } catch (e) {
    console.log("❌ Error:", url, e.message);
  }

  return null;
}

// ===============================
// STEP 5: MAIN
// ===============================
(async () => {

  console.log("🔄 Collecting URLs...");
  const urls = await collectAllATMUrls();

  console.log("📦 Collected ATM URLs:", urls.length); // ✅ ADD HERE


  // ✅ Load previous data (resume support)
  let results = [];
  try {
    results = JSON.parse(fs.readFileSync("atms.json"));
  } catch {}

  const resultsMap = new Map(results.map(r => [r.url, r]));

  


  // 🔥 LIMIT PER RUN (IMPORTANT)
  const MAX_URLS = 300;
  
  // ⏳ Refresh after 30 days
  const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
  
  const urlsToScrape = urls.filter(u => {
    const existing = resultsMap.get(u);
  
    // ✅ New URL → scrape
    if (!existing) return true;
  
    // ✅ Old URL → check last update time
    return (Date.now() - (existing.updatedAt || 0)) > THIRTY_DAYS;
  
  }).slice(0, MAX_URLS);


  

  console.log("🆕 New URLs to scrape:", urlsToScrape.length); // ✅ ADD HERE

  console.log("Total URLs:", urls.length);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const pages = await Promise.all(
    Array.from({ length: 5 }).map(() => browser.newPage())
  );


  

  for (let i = 0; i < urlsToScrape.length; i++) {
  const page = pages[i % pages.length];
  const url = urlsToScrape[i];

  console.log("Scraping:", url);

  const data = await scrapePage(page, url);

  if (data) {
    resultsMap.set(url, data); // ✅ add or update
  }

  await new Promise(r => setTimeout(r, 800));
}


    results = Array.from(resultsMap.values());

    console.log("💾 Saving progress...");
    fs.writeFileSync("atms.json", JSON.stringify(results, null, 2));

    await new Promise(r => setTimeout(r, 5000));
  

  await browser.close();

  // ✅ Keep only ATM
  results = results.filter(r =>
    (r.name || "").toLowerCase().includes("atm")
  );



  fs.writeFileSync("atms.json", JSON.stringify(results, null, 2));

  console.log("✅ FINAL ATMs:", results.length);

})();
