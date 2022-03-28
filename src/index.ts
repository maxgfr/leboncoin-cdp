import 'dotenv/config'; // To use our .env
import { getAllSearchResult } from './headless';

async function main() {
  await getAllSearchResult(
    'category=9&locations=Clermont-Ferrand__45.78574122226367_3.0939572793408208_9154_5000',
  );
}

main();
