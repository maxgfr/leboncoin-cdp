import fs from 'fs';
import { saveAllSearchResult, saveMainPage } from './headless';
import { formatDate } from './utils';

async function main() {
  await saveAllSearchResult(
    'category=8&locations=Neschers_63320__45.5915_3.16417_2978',
  );
  const result: Array<Record<string, any>> = JSON.parse(
    fs.readFileSync(
      `./assets/${'search_' + formatDate(new Date())}.json`,
      'utf8',
    ),
  );
  const ids: string[] = result.map((v) => v.list_id);
  await saveMainPage(ids);
}

main();
