import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const urlsPath = process.argv[2] || "urls.txt";
const outPath = process.argv[3] || "smartstore_products.csv";

const targets = fs
  .readFileSync(urlsPath, "utf-8")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((line) => {
    const pair = line.match(/^(.*?)\s*-\s*(https?:\/\/\S+)$/);
    if (pair) {
      return { titleHint: pair[1].trim(), url: pair[2].trim() };
    }
    return { titleHint: "", url: line };
  });

function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickDescFromJson(obj) {
  const hit = [];
  const seen = new Set();

  function walk(x) {
    if (!x || typeof x !== "object") return;
    if (seen.has(x)) return;
    seen.add(x);

    for (const [k, v] of Object.entries(x)) {
      if (typeof v === "string") {
        const key = k.toLowerCase();
        if (
          key.includes("description") ||
          key.includes("detail") ||
          key.includes("content") ||
          key.includes("html") ||
          key.includes("seone") ||
          key.includes("editor")
        ) {
          if (v.length > 80) hit.push(v);
        }
      } else if (v && typeof v === "object") {
        walk(v);
      }
    }
  }
  walk(obj);

  hit.sort((a, b) => b.length - a.length);
  return hit[0] || "";
}

async function scrapeOne(page, target) {
  const { url, titleHint } = target;
  const productIdMatch = url.match(/\/products\/(\d+)/);
  const productId = productIdMatch ? productIdMatch[1] : "";

  let productJson = null;

  const responseHandler = async (res) => {
    try {
      const u = res.url();
      if (u.includes("/i/v1/") && (u.includes("products") || u.includes("product"))) {
        const ct = (res.headers()["content-type"] || "").toLowerCase();
        if (ct.includes("application/json")) {
          const j = await res.json();
          const jStr = JSON.stringify(j);
          if (!productId || jStr.includes(`\"${productId}\"`) || jStr.includes(`:${productId}`)) {
            productJson = j;
          }
        }
      }
    } catch {}
  };

  page.on("response", responseHandler);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    let title = "";
    try {
      title = await page.locator("h3, h2, h1").first().innerText({ timeout: 1500 });
      title = (title || "").trim();
    } catch {}

    let desc = "";
    try {
      const scripts = await page.locator("script").allInnerTexts();
      for (const s of scripts) {
        if (s.includes("product") && s.includes("description") && s.length > 5000) {
          const m = s.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const j = JSON.parse(m[0]);
              const cand = pickDescFromJson(j);
              if (cand && cand.length > desc.length) desc = cand;
            } catch {}
          }
        }
      }
    } catch {}

    if (!desc && productJson) {
      desc = pickDescFromJson(productJson);
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const blocked =
      bodyText.includes("현재 서비스 접속이 불가합니다") ||
      bodyText.includes("에러페이지");
    const descTextRaw = stripHtml(desc);
    const descText =
      descTextRaw ||
      (blocked ? "[수집실패] 스마트스토어 접속 제한 페이지로 상세설명 미수집" : "");

    return { productId, title: title || titleHint, url, descText };
  } finally {
    page.off("response", responseHandler);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    locale: "ko-KR",
  });

  const page = await ctx.newPage();

  const rows = [];
  for (const target of targets) {
    try {
      const r = await scrapeOne(page, target);
      rows.push(r);
      console.log("OK", r.productId, r.title);
    } catch (e) {
      rows.push({
        productId: "",
        title: target.titleHint || "",
        url: target.url,
        descText: "[수집실패] 스크립트 예외 발생",
      });
      console.log("FAIL", target.url, e?.message || e);
    }
  }

  await browser.close();

  const header = ["productId", "title", "url", "descText"];
  const csv =
    `${header.join(",")}\n` +
    rows
      .map((r) => [r.productId, r.title, r.url, r.descText].map(csvEscape).join(","))
      .join("\n");

  fs.writeFileSync(outPath, csv, "utf-8");
  console.log("DONE:", path.resolve(outPath));
})();
