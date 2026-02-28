import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://sell.smartstore.naver.com/#/login");

console.log("로그인 완료 후 터미널에서 Enter 치세요.");
process.stdin.resume();
await new Promise(res => process.stdin.once("data", res));

await context.storageState({ path: "ss_storage.json" });
await browser.close();

console.log("ss_storage.json 저장 완료");
