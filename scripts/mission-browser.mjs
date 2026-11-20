import puppeteer from '/tmp/board-test/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { startVehicle } from './mission-vehicle.mjs';

const { wss, state } = startVehicle(8790);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.log('ERR', error.message));
const click = (label) => page.evaluate((text) => {
  const node = [...document.querySelectorAll('button')].find((item) => item.offsetParent && item.textContent?.includes(text));
  if (!node) return false;
  node.click();
  return true;
}, label);

await page.setViewport({ width: 1280, height: 800 });
await page.goto('http://127.0.0.1:4173/#/start', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.innerText.includes('지도로'), { timeout: 20000 });
await page.type('input[aria-label="이름"]', '수색1');
await click('지도로');
await page.waitForSelector('.map-frame');
await new Promise((resolve) => setTimeout(resolve, 1000));
await click('사각형');
const map = await page.$('.map-frame');
const box = await map.boundingBox();
for (const [x, y] of [[0.32, 0.28], [0.68, 0.55]]) {
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!await click('저장')) throw new Error('구역을 저장하지 못했습니다.');
await page.waitForFunction(() => document.body.innerText.includes('구역 1'), { timeout: 8000 });
await click('기체');
await page.$eval('input[aria-label="기체 주소"]', (input) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'ws://127.0.0.1:8790');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await click('주소 연결');
await page.waitForFunction(() => document.body.innerText.includes('위성 14'), { timeout: 8000 });
if (!await click('경로 올리기')) throw new Error('경로 올리기 버튼이 없습니다.');
await page.waitForFunction(() => document.body.innerText.includes('임무를 올렸습니다'), { timeout: 8000 });
if (!await click('자동 수색')) throw new Error('자동 수색 버튼이 없습니다.');
await page.waitForFunction(() => {
  const value = document.querySelector('[data-mission]')?.getAttribute('data-mission') ?? '0/0';
  return Number(value.split('/')[0]) >= 2;
}, { timeout: 8000 });
await new Promise((resolve) => setTimeout(resolve, 700));

async function shot(name, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    mission: document.querySelector('[data-mission]')?.getAttribute('data-mission'),
    title: document.querySelector('.sheet h2')?.getBoundingClientRect().top ?? null,
    telem: document.querySelector('.telem')?.getBoundingClientRect().bottom ?? null,
  }));
}

const wide = await shot('mission_progress_1280', 1280, 800);
const phone = await shot('mission_progress_390', 390, 844);
await page.setViewport({ width: 1280, height: 800 });
await page.waitForFunction(() => document.body.innerText.includes('통과'), { timeout: 20000 });
const passed = true;
console.log(JSON.stringify({
  passed,
  wide,
  phone,
  clients: state.clients,
  count: state.expected,
  seq: state.seq,
  reached: state.reached,
  armed: state.armed,
  mode: state.mode,
  commands: state.items.map((item) => item?.command),
}, null, 2));
await browser.close();
wss.close();
