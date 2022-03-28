import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-expect-error
import AnonymUa from 'puppeteer-extra-plugin-anonymize-ua';

puppeteer.use(AdblockerPlugin());
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymUa());

export async function saveAllSearchResult(
  query: string,
  saveContent = {
    fileName: 'scrap',
  },
  chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
): Promise<void> {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
  });

  const page = await browser.newPage();
  await page.goto('https://www.leboncoin.fr/recherche?' + query);

  const pageContent = await page.content();

  if (saveContent) {
    fs.writeFileSync(`./assets/${saveContent.fileName}.html`, pageContent);
  }

  await browser.close();
}
