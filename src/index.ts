import 'dotenv/config'; // To use our .env
import { takeScreenshot } from './headless';

async function main() {
  await takeScreenshot('https://www.leboncoin.fr', 'homepage');
}

main();
