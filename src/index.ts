import fs from 'fs';
import { saveAllSearchResult, saveMainPage } from './headless';
import { formatDate } from './utils';

async function main() {
  await saveAllSearchResult(
    'category=9&locations=75012__48.84105000000001_2.3892800000000003_5000%2C75017__48.883869999999995_2.3186300000000006_2930&price=150000-300000',
  );
  const result: Array<Record<string, any>> = JSON.parse(
    fs.readFileSync(
      `./assets/${'search_' + formatDate(new Date())}.json`,
      'utf8',
    ),
  );
  const ids: string[] = result.map((v) => v.list_id);
  console.log(ids);
  // await saveMainPage(ids);
}

main();
