const puppeteer = require("puppeteer");
const fs = require("fs");

async function getATMUrls(page) {

  console.log("🔍 Searching Google...");

  await page.goto(
    "https://www.google.com/search?q=site:locate.pnb.bank.in ATM Map",
    { waitUntil: "networkidle2" }
  );

  await new Promise(r => setTimeout(r, 3000));

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map(a => a.href)
      .filter(h =>
        h.includes("locate.pnb.bank.in") &&
        h.includes("/atm-") &&
        h.includes("/Map")
      );
  });

  return [...new Set(links)];
}

// 🔹 Extract ATM data
async function extract(page, url) {

  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 3000));

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

(async () => {

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  // 🔥 STEP 1: Get URLs automatically
  const urls = await getATMUrls(page);

  console.log("Found URLs:", urls.length);

  let results = [];

  for (let url of urls.slice(0, 10)) { // limit first
    console.log("Scraping:", url);

    try {
      const data = await extract(page, url);

      if (data.lat && data.lng) {
        results.push({
          name: data.name,
          lat: parseFloat(data.lat),
          lng: parseFloat(data.lng),
          url
        });
      }

    } catch {}

    await new Promise(r => setTimeout(r, 4000));
  }

  await browser.close();

  fs.writeFileSync("atms.json", JSON.stringify(results, null, 2));

  console.log("Saved:", results.length);

})();
