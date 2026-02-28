import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: "ss_storage.json" });
const page = await context.newPage();

const ids = fs.readFileSync("product_ids.txt","utf-8")
  .split(/\r?\n/).filter(Boolean);

fs.mkdirSync("smartstore_details",{ recursive:true });

for (const id of ids) {
  await page.goto(`https://sell.smartstore.naver.com/#/products/edit/${id}`);
  await page.waitForTimeout(2000);

  let html = "";

  // iframe 시도
  for (const f of page.frames()) {
    try {
      const content = await f.evaluate(() => document.body?.innerHTML || "");
      if (content.length > 500) {
        html = content;
        break;
      }
    } catch {}
  }

  if (!html) {
    const editable = page.locator("[contenteditable=true]").first();
    if (await editable.isVisible().catch(()=>false)) {
      html = await editable.evaluate(el=>el.innerHTML);
    }
  }

  if (html && html.length > 200) {
    fs.writeFileSync(`smartstore_details/${id}.html`, html);
    console.log(id,"저장완료");
  } else {
    console.log(id,"상세설명 못찾음");
  }
}

await browser.close();
console.log("완료");
