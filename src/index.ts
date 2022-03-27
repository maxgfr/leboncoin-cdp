import 'dotenv/config'; // To use our .env
import { takeScreenshot } from './headless';

async function main() {
  await takeScreenshot(
    'https://www.leboncoin.fr/recherche?category=9&locations=Clermont-Ferrand__45.78574122226367_3.0939572793408208_9154&owner_type=private&real_estate_type=1%2C2',
    'homepage',
  );
}

main();
