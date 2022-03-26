import 'dotenv/config'; // To use our .env

import fetch from 'node-fetch';
import UserAgent from 'user-agents';
import cookie from 'cookie';
import { HttpsProxyAgent } from 'https-proxy-agent';

// https://www.leboncoin.fr/recherche?category=9&locations=Clermont-Ferrand__45.78574122226367_3.0939572793408208_9154&owner_type=private&sort=price&order=asc&real_estate_type=1%2C2

// List of proxy : https://sunny9577.github.io/proxy-scraper/proxies.json
const fetchCookie = (
  url = 'https://www.leboncoin.fr/',
  proxy?: HttpsProxyAgent,
): Promise<[string, string, string]> => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    fetch(url, {
      signal: controller.signal,
      agent: proxy ?? undefined,
    })
      .then((res) => {
        const sessionCookie = res.headers.get('set-cookie') ?? '';
        controller.abort();
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
  const [instanceId, datadome, didomi_token] = await fetchCookie();
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

// /**
//  * Parse a vinted URL to get the querystring usable in the search endpoint
//  */
// const parseVintedURL = (url, disableOrder, allowSwap, customParams = {}) => {
//     try {
//         const decodedURL = decodeURI(url);
//         const matchedParams = decodedURL.match(/^https:\/\/www\.vinted\.([a-z]+)/);
//         if (!matchedParams) return {
//             validURL: false
//         };

//         const missingIDsParams = ['catalog', 'status'];
//         const params = decodedURL.match(/(?:([a-z_]+)(\[\])?=([a-zA-Z 0-9._À-ú+%]*)&?)/g);
//         if (typeof matchedParams[Symbol.iterator] !== 'function') return {
//             validURL: false
//         };
//         const mappedParams = new Map();
//         for (const param of params) {
//             let [ _, paramName, isArray, paramValue ] = param.match(/(?:([a-z_]+)(\[\])?=([a-zA-Z 0-9._À-ú+%]*)&?)/);
//             if (paramValue?.includes(' ')) paramValue = paramValue.replace(/ /g, '+');
//             if (isArray) {
//                 if (missingIDsParams.includes(paramName)) paramName = `${paramName}_id`;
//                 if (mappedParams.has(`${paramName}s`)) {
//                     mappedParams.set(`${paramName}s`, [ ...mappedParams.get(`${paramName}s`), paramValue ]);
//                 } else {
//                     mappedParams.set(`${paramName}s`, [paramValue]);
//                 }
//             } else {
//                 mappedParams.set(paramName, paramValue);
//             }
//         }
//         for (const key of Object.keys(customParams)) {
//             mappedParams.set(key, customParams[key]);
//         }
//         const finalParams = [];
//         for (const [ key, value ] of mappedParams.entries()) {
//             finalParams.push(typeof value === 'string' ? `${key}=${value}` : `${key}=${value.join(',')}`);
//         }

//         return {
//             validURL: true,
//             domain: matchedParams[1],
//             querystring: finalParams.join('&')
//         }
//     } catch (e) {
//         return {
//             validURL: false
//         }
//     }
// }

// const cookies = new Map();

// /**
//  * Searches something on Vinted
//  */
// const search = (url, disableOrder = false, allowSwap = false, customParams = {}) => {
//     return new Promise(async (resolve, reject) => {

//         const { validURL, domain, querystring } = parseVintedURL(url, disableOrder ?? false, allowSwap ?? false, customParams);

//         if (!validURL) {
//             console.log(`[!] ${url} is not valid in search!`);
//             return resolve([]);
//         }

//         const cachedCookie = cookies.get(domain);
//         const cookie = cachedCookie && cachedCookie.createdAt > Date.now() - 60_000 ? cachedCookie.cookie : await fetchCookie(domain).catch(() => {});
//         if (!cookie) {
//             return reject('Could not fetch cookie');
//         }
//         if (!cachedCookie || cachedCookie.cookie !== cookie) {
//             cookies.set(domain, {
//                 cookie,
//                 createdAt: Date.now()
//             });
//         }

//         const controller = new AbortController();
//         fetch(`https://www.vinted.${domain}/api/v2/catalog/items?${querystring}`, {
//             signal: controller.signal,
//             agent: process.env.VINTED_API_HTTPS_PROXY ? new HttpsProxyAgent(process.env.VINTED_API_HTTPS_PROXY) : undefined,
//             headers: {
//                 cookie: '_vinted_fr_session=' + cookie,
//                 'user-agent': new UserAgent().toString(),
//                 accept: 'application/json, text/plain, */*'
//             }
//         }).then((res) => {
//             res.text().then((text) => {
//                 controller.abort();
//                 try {
//                     resolve(JSON.parse(text));
//                 } catch (e) {
//                     reject(text);
//                 }
//             });
//         }).catch(() => {
//             controller.abort();
//             reject('Can not fetch search API');
//         });

//     });
// }
