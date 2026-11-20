import puppeteer from '/tmp/board-test/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { startShim } from './mavlink-shim.mjs';

const port = 8788;
const { state, wss } = startShim(port);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function clickText(page, text) {
  const clicked = await page.evaluate((label) => {
    const nodes = [...document.querySelectorAll('button, a')];
    const node = nodes.find((item) => item.offsetParent !== null && item.textContent?.includes(label));
    if (!node) return false;
    node.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`버튼을 찾지 못했습니다: ${text}`);
}

async function shot(page, name, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return overflow;
}

const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/#/start', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.body.innerText.includes('지도로'), { timeout: 20000 });
await page.type('input[aria-label="이름"]', '수색1');
await clickText(page, '지도로');
await page.waitForSelector('.map-frame', { timeout: 20000 });
await new Promise((resolve) => setTimeout(resolve, 1200));
await clickText(page, '사각형');
const map = await page.$('.map-frame');
const box = await map.boundingBox();
const points = [
  [0.35, 0.22],
  [0.62, 0.38],
];
for (const [x, y] of points) {
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await new Promise((resolve) => setTimeout(resolve, 200));
}
await clickText(page, '저장');
await page.waitForFunction(() => document.body.innerText.includes('구역 1'), { timeout: 8000 });
await clickText(page, '기체');
await page.$eval('input[aria-label="기체 주소"]', (input) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'ws://127.0.0.1:8788');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await clickText(page, '주소 연결');
await page.waitForFunction(() => document.querySelector('[data-link-note]')?.textContent?.includes('연결됨'), { timeout: 8000 });
await clickText(page, '자동 진행');
await clickText(page, '비행 시작');
await page.waitForFunction(() => document.querySelector('[data-step]')?.getAttribute('data-step') === 'confirmed', { timeout: 20000 });
const step = await page.$eval('[data-step]', (node) => node.getAttribute('data-step'));
const note = await page.$eval('[data-link-note]', (node) => node.textContent);
const widths = {};
widths.w375 = await shot(page, 'usb_mission_375', 375, 812);
widths.w390 = await shot(page, 'usb_mission_390', 390, 844);
widths.w768 = await shot(page, 'usb_mission_768', 768, 1024);
widths.w1280 = await shot(page, 'usb_mission_1280', 1280, 800);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.evaluate(() => {
  const sheet = document.querySelector('.sheet');
  if (sheet) sheet.scrollTop = sheet.scrollHeight;
});
await new Promise((resolve) => setTimeout(resolve, 300));
await page.screenshot({ path: '/opt/cursor/artifacts/usb_panel_390.png' });
const progress = await page.$eval('.board', (node) => node.getAttribute('data-progress'));
console.log(JSON.stringify({ step, progress, note, moved: state.moved, reposition: state.reposition, clients: state.clients, widths }, null, 2));
const plain = await browser.newPage();
await plain.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'serial', { configurable: true, get() { return undefined; } });
});
await plain.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await plain.goto(page.url(), { waitUntil: 'domcontentloaded' });
await plain.waitForSelector('.map-frame');
await plain.evaluate(() => [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('기체'))?.click());
await plain.waitForFunction(() => document.body.innerText.includes('아이폰 Safari'), { timeout: 8000 });
await plain.evaluate(() => document.querySelector('.craft-actions')?.scrollIntoView({ block: 'center' }));
await new Promise((resolve) => setTimeout(resolve, 400));
const serialText = await plain.evaluate(() => document.body.innerText.includes('아이폰 Safari'));
await plain.screenshot({ path: '/opt/cursor/artifacts/usb_noserial_390.png' });
console.log(JSON.stringify({ serialText }));
await browser.close();
wss.close();
