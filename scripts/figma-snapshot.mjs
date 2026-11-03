// Serializes Dot Reading screens into self-contained HTML for Figma's html_to_figma
// (see docs/design-workflow.md). Requires the local stack (`npx.cmd supabase start`)
// and `npm.cmd run dev:local -- --port 5174`; signs in only with the fictional
// accounts from supabase/seed.sql. Matching @media rules are flattened for the
// capture width, assets become data URIs, and scripts are removed.
// Usage: npm run figma:snapshot -- <outDir> [screen-prefix ...]   e.g. 06 09
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:5174", PASSWORD = "local-dev-password"; // local-only seed password
const OUT = process.argv[2] ?? join(tmpdir(), "dot-reading-figma"), ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const log = [];

async function serialize(page, name, size, width) {
  if (ONLY.length && !ONLY.some(prefix => name.startsWith(prefix))) return;
  await page.waitForTimeout(700);
  const html = await page.evaluate(async (width) => {
    const toData = async (url) => {
      try {
        const blob = await (await fetch(url)).blob();
        return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      } catch { return url; }
    };
    const inlineUrls = async (css, base) => {
      const urls = [...new Set([...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m => m[1]))].filter(u => !u.startsWith("data:"));
      for (const u of urls) css = css.split(u).join(await toData(new URL(u, base).href));
      return css;
    };
    const flatten = (rules) => {
      let out = "";
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) { if (matchMedia(rule.media.mediaText).matches) out += flatten(rule.cssRules); }
        else if (rule instanceof CSSImportRule) continue;
        else out += rule.cssText + "\n";
      }
      return out;
    };
    let css = "";
    for (const sheet of document.styleSheets) {
      try { css += await inlineUrls(flatten(sheet.cssRules), sheet.href || location.href); } catch { /* cross-origin font sheet */ }
    }
    // Freeze form values and inline images before cloning.
    for (const el of document.querySelectorAll("input,textarea")) {
      if (el.type === "checkbox" || el.type === "radio") el.toggleAttribute("checked", el.checked);
      else if (el.tagName === "TEXTAREA") el.textContent = el.value; else el.setAttribute("value", el.value);
    }
    for (const el of document.querySelectorAll("select")) for (const o of el.options) o.toggleAttribute("selected", o.selected);
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script,link,style,noscript").forEach(n => n.remove());
    // Figma collapses pre-wrap newlines, so paragraph breaks become explicit <br>s.
    for (const token of clone.querySelectorAll(".reading-token")) {
      const text = token.textContent;
      if (text.includes("\n") && !text.trim()) token.innerHTML = "<br>".repeat(text.split("\n").length - 1);
    }
    for (const img of clone.querySelectorAll("img")) {
      const live = document.querySelector(`img[src="${img.getAttribute("src")}"]`);
      img.setAttribute("src", await toData(live ? live.currentSrc || live.src : img.src));
      img.removeAttribute("srcset");
    }
    for (const el of clone.querySelectorAll("[style*='url(']")) el.setAttribute("style", await inlineUrls(el.getAttribute("style"), location.href));
    const style = document.createElement("style");
    style.textContent = `@import url("https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&display=swap");\n${css}\nhtml,body{width:${width}px!important;min-width:${width}px!important;max-width:${width}px!important;}`;
    clone.querySelector("head").appendChild(style);
    return "<!doctype html>\n" + clone.outerHTML;
  }, width);
  writeFileSync(`${OUT}/${name}-${size}.html`, html);
  log.push(`ok   ${name}-${size} ${(html.length / 1024).toFixed(0)}KB`);
}
async function step(name, size, fn) { try { await fn(); } catch (e) { log.push(`FAIL ${name}-${size}: ${e.message.split("\n")[0]}`); } }
async function signIn(page, portal, email) {
  await page.goto(`${BASE}/${portal}`);
  await page.getByPlaceholder(/@school\.org/).fill(email);
  await page.getByPlaceholder("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Sign in as/ }).click();
  await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ channel: "msedge" });
for (const [size, viewport] of Object.entries(sizes)) {
  const isMobile = size === "mobile", W = viewport.width;
  const ctx = () => browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 });
  { const c = await ctx(), page = await c.newPage();
    for (const [name, path] of [["01-homepage", "/"], ["02-teacher-portal", "/teacher"], ["03-student-portal", "/student"]])
      await step(name, size, async () => { await page.goto(BASE + path); await page.waitForLoadState("networkidle"); await serialize(page, name, size, W); });
    await c.close(); }
  { const c = await ctx(), page = await c.newPage();
    await step("teacher-signin", size, () => signIn(page, "teacher", "teacher@example.test"));
    await step("04-teacher-classrooms", size, () => serialize(page, "04-teacher-classrooms", size, W));
    await step("05-class-overview", size, async () => {
      await page.getByRole("list", { name: "Teacher classes" }).getByText("Room 12 Readers").first().click();
      await page.getByRole("tab", { name: "Overview" }).waitFor();
      await serialize(page, "05-class-overview", size, W);
    });
    for (const [n, tab] of [["06-class-students", "Students"], ["07-class-statistics", "Statistics"]])
      await step(n, size, async () => { await page.getByRole("tab", { name: tab }).click(); await serialize(page, n, size, W); });
    await step("08-my-practices", size, async () => { await page.getByRole("button", { name: "My Practices" }).first().click(); await serialize(page, "08-my-practices", size, W); });
    await step("09-practice-preview", size, async () => {
      await page.getByRole("button", { name: /^Preview/ }).first().click();
      await page.locator('[aria-label="Practice preview"]').first().waitFor({ timeout: 10000 });
      await serialize(page, "09-practice-preview", size, W);
    });
    await step("10-practice-customize", size, async () => {
      await page.getByRole("button", { name: /^Customize/ }).first().click();
      await page.locator('[aria-label="Practice editor"]').first().waitFor({ timeout: 10000 });
      await serialize(page, "10-practice-customize", size, W);
    });
    await c.close(); }
  { const c = await ctx(), page = await c.newPage();
    await step("student-signin", size, () => signIn(page, "student", "student@example.test"));
    await step("11-student-classes", size, () => serialize(page, "11-student-classes", size, W));
    await step("12-student-class", size, async () => {
      await page.getByRole("list", { name: "Student classes" }).getByText("Room 12 Readers").first().click();
      await serialize(page, "12-student-class", size, W);
    });
    await c.close(); }
}
await browser.close();
console.log(log.join("\n") + `\nWrote ${OUT}`);
