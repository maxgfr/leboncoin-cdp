import 'dotenv/config'; // To use our .env
import { getScreenshot } from './headless';

async function main() {
  const res = await getScreenshot('https://www.leboncoin.fr');
  console.log(res);
}

main();
