import puppeteer from 'puppeteer';

export async function getScreenshot(url: string): Promise<Buffer | string> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const buffer = await page.screenshot();
  await browser.close();
  return buffer;
}
