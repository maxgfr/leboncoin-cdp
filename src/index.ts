import 'dotenv/config'; // To use our .env

import fetch from 'node-fetch';
import UserAgent from 'user-agents';
import cookie from 'cookie';
import { HttpsProxyAgent } from 'https-proxy-agent';

// https://www.leboncoin.fr/recherche?category=9&locations=Clermont-Ferrand__45.78574122226367_3.0939572793408208_9154&owner_type=private&sort=price&order=asc&real_estate_type=1%2C2

// List of proxy : https://sunny9577.github.io/proxy-scraper/proxies.json
const fetchApi = (
  url = 'https://lbc-aio.p.rapidapi.com/cookie',
  headers = {
    'X-RapidAPI-Host': 'lbc-aio.p.rapidapi.com',
    'X-RapidAPI-Key': '3d2b75d028msh07f03549deea5a8p1f1c75jsn1fa9b1d61852',
  },
  proxy?: HttpsProxyAgent,
): Promise<[string, string, string]> => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    fetch(url, {
      signal: controller.signal,
      agent: proxy ?? undefined,
      headers,
    })
      .then((res) => {
        const sessionCookie = res.headers.get('set-cookie') ?? '';
        controller.abort();
        console.log(sessionCookie);
        console.log(cookie.parse(sessionCookie));
        resolve([
          cookie.parse(sessionCookie)['secure, __Secure-InstanceId'],
          cookie.parse(sessionCookie)['secure, datadome'],
          cookie.parse(sessionCookie)['secure, didomi_token'],
        ]);
      })
      .catch(() => {
        controller.abort();
        reject();
      });
  });
};

async function main() {
  const [instanceId, datadome, didomi_token] = await fetchApi();
  const userAgent = new UserAgent();
  const headers = {
    'User-Agent': userAgent.toString(),
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    Cookie: `secure, __Secure-InstanceId=${instanceId}; secure, datadome=${datadome}; secure, didomi_token=${didomi_token}`,
  };
  // const res = await fetch('https://www.leboncoin.fr/', {
  //     headers
  // });
  console.log(headers);
}

main();
