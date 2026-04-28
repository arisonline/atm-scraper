const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const zlib = require("zlib");

// ===============================
// STEP 1: Load sitemap
// ===============================
async function getSitemapLinks() {
  const res = await axios.get("https://locate.pnb.bank.in/sitemap.xml");
  return (res.data.match(/https:[^<]+\.xml\.gz/g) || []).slice(0, 3);
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

  let all = [];
  for (let m of maps) {
    const urls = await getATMUrlsFromGZ(m);
    all.push(...urls);
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

  // 🔥 CLEAN TEXT LINES
  const lines = document.body.innerText
    .split("\n")
    .map(l => l.trim())
    .filter(l =>
      l.length > 2 &&
      !l.includes("Submit a Review") &&
      !l.includes("Read Reviews") &&
      !l.includes("Nearby Branches") &&
      !l.includes("PNB branches") &&
      !l.includes("Click here") &&
      !l.includes("Scan this QR")
    );

  let address = "";
  let pincode = "";
  let phone = "";
  let ifsc = "";
  let landmark = "";

  // 🔹 PINCODE (anchor)
  let pinIndex = lines.findIndex(l => /\b\d{6}\b/.test(l));

  if (pinIndex !== -1) {
    const pinMatch = lines[pinIndex].match(/\b\d{6}\b/);
    pincode = pinMatch ? pinMatch[0] : "";

    // 🔥 ADDRESS = 2–3 lines before pincode
    const start = Math.max(0, pinIndex - 3);
    address = lines.slice(start, pinIndex + 1).join(", ");
  }

  // 🔹 PHONE (only real numbers)
  const phoneMatch = document.body.innerText.match(/(\+91\d{10}|\b\d{10}\b)/);
  if (phoneMatch) phone = phoneMatch[0];

  // 🔹 IFSC
  const ifscMatch = document.body.innerText.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/);
  if (ifscMatch) ifsc = ifscMatch[0];

  // 🔹 LANDMARK (ONLY real ones)
  const landmarkLine = lines.find(l =>
    l.toLowerCase().includes("near ") ||
    l.toLowerCase().includes("above ")
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
        url
      };
    }

  } catch (e) {
    console.log("❌ Error:", url);
  }

  return null;
}

// ===============================
// STEP 5: MAIN
// ===============================
(async () => {

  console.log("🔄 Collecting URLs...");
  const urls = await collectAllATMUrls();

  console.log("Total:", urls.length);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  let results = [];

  for (let url of urls.slice(0, 10)) {
    console.log("Scraping:", url);

    const data = await scrapePage(page, url);

    if (data) results.push(data);

    await new Promise(r => setTimeout(r, 3000));
  }

  await browser.close();

  fs.writeFileSync("atms.json", JSON.stringify(results, null, 2));

  console.log("✅ Done:", results.length);

})();
