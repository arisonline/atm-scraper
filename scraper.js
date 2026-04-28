const puppeteer = require("puppeteer");
const fs = require("fs");

async function scrape(url) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2" });

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

    const name = document.querySelector("h1")?.innerText || "";

    return { name, lat, lng };
  });

  await browser.close();
  return data;
}

(async () => {

  const urls = [
    "https://locate.pnb.bank.in/punjab-national-bank-atm-atm-duttapulia-bagula-road-nadia-520824/Map"
  ];

  const results = [];

  for (let url of urls) {
    const data = await scrape(url);
    results.push(data);
  }

  fs.writeFileSync("data.json", JSON.stringify(results, null, 2));
})();
