import 'dotenv/config'; // To use our .env
import { exploitSearchContent } from './exploit';
import fs from 'fs';

async function main() {
  // await saveAllSearchResult(
  //   'category=9&locations=Clermont-Ferrand__45.78574122226367_3.0939572793408208_9154_5000',
  // );
  exploitSearchContent(fs.readFileSync('assets/scrap.html', 'utf8'));
}

main();
