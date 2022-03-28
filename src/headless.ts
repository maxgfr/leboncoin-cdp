import Apify from 'apify';
import { SearchResult } from './types';

export async function getAllSearchResult(
  query: string,
  chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    Apify.main(async () => {
      const browser = await Apify.launchPuppeteer({
        stealth: true,
        launchOptions: {
          executablePath: chromePath,
        },
      });
      const page = await browser.newPage();
      await page.goto('https://www.leboncoin.fr/recherche?' + query);
      await browser.close();
      resolve([{ title: 'test' }]);
    });
  });
}
