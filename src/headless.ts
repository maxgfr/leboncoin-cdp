import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-expect-error
import AnonymUa from 'puppeteer-extra-plugin-anonymize-ua';
import { exploitSearchContent } from './exploit';

puppeteer.use(AdblockerPlugin());
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymUa());

export async function saveAllSearchResult(
  query: string,
  saveExternalContent = {
    fileName: 'scrap',
  },
  chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  resultPerPage = 35,
): Promise<void> {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
  });

  const page = await browser.newPage();
  await page.goto('https://www.leboncoin.fr/recherche?' + query);

  const pageContent = await page.content();

  if (saveExternalContent) {
    fs.writeFileSync(
      `./assets/${saveExternalContent.fileName}.html`,
      pageContent,
    );
  }

  const result = exploitSearchContent(pageContent, new Date(), {
    fileName: 'res1',
  });

  const nbPages = Math.ceil(result.total / resultPerPage);

  if (nbPages > 1) {
    for (let i = 2; i <= nbPages; i++) {
      await page.goto(
        'https://www.leboncoin.fr/recherche?' + query + `&page=${i}`,
      );

      const res = exploitSearchContent(await page.content(), new Date(), {
        fileName: 'res' + i,
      });

      if (res.isFinishToFetch) {
        break;
      }
    }
  }

  await browser.close();
}
