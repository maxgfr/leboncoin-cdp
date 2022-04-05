import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import AnonymUa from 'puppeteer-extra-plugin-anonymize-ua';
import { exploitPageContent, exploitSearchContent } from './exploit';
import { formatDate, mergeAllAssetsJsonFiles } from './utils';

puppeteer.use(AdblockerPlugin());
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymUa());

export async function saveAllSearchResult(
  query: string,
  maxDate = new Date(),
  fileName = 'search_' + formatDate(new Date()),
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

  const result = exploitSearchContent(pageContent, new Date(), fileName + '1');

  const nbPages = Math.ceil(result.total / resultPerPage);

  let lastId = 1;

  if (nbPages > 1) {
    for (let i = 2; i <= nbPages; i++) {
      await page.goto(
        'https://www.leboncoin.fr/recherche?' + query + `&page=${i}`,
      );

      const res = exploitSearchContent(
        await page.content(),
        maxDate,
        fileName + i,
      );

      lastId = i;

      if (res.isFinishToFetch) {
        break;
      }
    }
  }

  mergeAllAssetsJsonFiles(fileName, lastId);

  await browser.close();
}

export async function saveMainPage(
  id: string[],
  fileName = 'page_' + formatDate(new Date()),
  chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
): Promise<void> {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
  });

  const page = await browser.newPage();

  for (let i = 0; i < id.length; i++) {
    await page.goto(
      'https://www.leboncoin.fr/ventes_immobilieres/' + id[i] + '.htm',
    );
    await page.click('button[data-qa-id="adview_button_phone_contact"]');
    exploitPageContent(await page.content(), fileName + id, 'wsh');
  }

  await browser.close();
}
