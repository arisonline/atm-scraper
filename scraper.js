const puppeteer = require("puppeteer");
const fs = require("fs");

// 🔹 Sleep helper
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🔹 Get ATM URLs from Bing
async function getATMUrls(page) {

  console.log("🔍 Searching Bing...");

  const allLinks = [];

  for (let start = 0; start <= 20; start += 10) {

    const url = `https://www.bing.com/search?q=site:locate.pnb.bank.in ATM Map&first=${start}`;

    console.log("Page:", url);

    await page.goto(url, { waitUntil: "networkidle2" });
    await sleep(2000);

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(h =>
          h.includes("locate.pnb.bank.in") &&
          h.includes("/atm-") &&
          h.includes("/Map")
        );
    });

    console.log("Found links:", links.length);

    allLinks.push(...links);
  }

  // remove duplicates
  return [...new Set(allLinks)];
}

// 🔹 Extract ATM data
async function extractATM(page, url) {

  console.log("Scraping:", url);

  await page.goto(url, { waitUntil: "networkidle2" });
  await sleep(3000);

  const data = await page.evaluate(() => {

    let lat = "", lng = "";

    // 🔥 improved regex
    document.querySelectorAll("script").forEach(s => {
      const txt = s.innerText;

      const latMatch = txt.match(/lat[^\d\-]*([0-9.\-]+)/i);
      const lngMatch = txt.match(/lng|lon[^\d\-]*([0-9.\-]+)/i);

      if (latMatch && lngMatch) {
        lat = latMatch[1];
        lng = lngMatch[1];
      }
    });

    const name = document.querySelector("h1")?.innerText || "";

    return { name, lat, lng };
  });

  if (!data.lat || !data.lng) return null;

  return {
    name: data.name.trim(),
    lat: parseFloat(data.lat),
    lng: parseFloat(data.lng),
    url
  };
}

// 🔹 MAIN
(async () => {

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  // 👉 STEP 1: Get URLs automatically
  const urls = await getATMUrls(page);

  console.log("Total URLs found:", urls.length);

  const results = [];

  // 👉 STEP 2: Scrape ATM data
  for (let url of urls.slice(0, 10)) { // limit for free run

    try {
      const atm = await extractATM(page, url);

      if (atm) results.push(atm);

    } catch (e) {
      console.log("Error:", url);
    }

    await sleep(4000); // avoid blocking
  }

  await browser.close();

  // 👉 STEP 3: Save
  fs.writeFileSync("atms.json", JSON.stringify(results, null, 2));

  console.log("✅ Saved ATMs:", results.length);

})();
