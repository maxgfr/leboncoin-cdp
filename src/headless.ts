import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import AnonymUa from 'puppeteer-extra-plugin-anonymize-ua';
import { exploitPageContent, exploitSearchContent } from './exploit';
import { formatDate, getNextJsProps, mergeAllAssetsJsonFiles } from './utils';
import { Page } from 'puppeteer';

puppeteer.use(AdblockerPlugin());
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymUa());

export async function saveAllSearchResult(
  query: string,
  fileName = 'search_' + formatDate(new Date()),
  chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  resultPerPage = 35,
): Promise<void> {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
  });

  let page: Page;

  page = await browser.newPage();
  await page.goto('https://www.leboncoin.fr/recherche?' + query);

  const mainContent = await page.content();

  let validationHasBeenDone = false;

  while (!validationHasBeenDone) {
    try {
      getNextJsProps(mainContent);
      validationHasBeenDone = true;
    } catch (e) {
      await page.waitForNavigation();
      await page.close();
      page = await browser.newPage();
      await page.goto('https://www.leboncoin.fr/recherche?' + query);
    }
  }

  const result = exploitSearchContent(mainContent, fileName + '_1');

  const nbPages = Math.ceil(result.total / resultPerPage);

  let lastId = 1;

  if (nbPages > 1) {
    for (let i = 2; i <= nbPages; i++) {
      await page.goto(
        'https://www.leboncoin.fr/recherche?' + query + `&page=${i}`,
      );

      const pageContent = await page.content();

      exploitSearchContent(pageContent, fileName + '_' + i);

      lastId = i;
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

    exploitPageContent(await page.content(), fileName + '_' + id[i]);
  }

  await browser.close();
}
