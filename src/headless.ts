import Apify from 'apify';

export async function takeScreenshot(
  url: string,
  filename: string,
  chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
) {
  Apify.main(async () => {
    const browser = await Apify.launchPuppeteer({
      stealth: true,
      launchOptions: {
        executablePath: chromePath,
      },
    });
    const page = await browser.newPage();
    await page.goto(url);
    await page.screenshot({ path: `./assets/${filename}.png` });
    await browser.close();
  });
}
