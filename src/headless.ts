import puppeteer from 'puppeteer';

export async function takeScreenshot(
  url: string,
  filename: string,
): Promise<Buffer | string> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const buffer = await page.screenshot({ path: `./assets/${filename}.png` });
  await browser.close();
  return buffer;
}
