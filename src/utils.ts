import fs from 'fs';

export const getNextJsProps = (content: string): Record<string, any> => {
  const result = content.match(
    // eslint-disable-next-line no-useless-escape
    /<script id=\"__NEXT_DATA__\" type=\"application\/json\" crossorigin=\"anonymous\">(.*?)<\/script>/g,
  );
  if (!result) {
    throw new Error('Ne match rien au niveau du resultat');
  }
  const mappedResult = result.map(function (val) {
    return val
      .replace('</script>', '')
      .replace(
        '<script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">',
        '',
      );
  });
  if (!mappedResult || mappedResult.length === 0) {
    throw new Error('Problème au niveau du content');
  }
  return JSON.parse(mappedResult[0]);
};

export const getPhoneNumber = (content: string): string | undefined => {
  try {
    const otherAndPhone = content.split('tel:');
    const phoneNumber = otherAndPhone[1].slice(0, 10);
    return phoneNumber;
  } catch {
    return undefined;
  }
};

export const mergeAllAssetsJsonFiles = (
  fileName: string,
  lastId: number,
  isForSave = true,
) => {
  const files = [];
  for (let i = 1; i <= lastId; i++) {
    files.push(`./assets/${fileName}${i}.json`);
  }
  const result = mergeArrayOfJson(...files);
  if (isForSave)
    fs.writeFileSync(
      `./assets/${fileName}.json`,
      JSON.stringify(result, null, 2),
    );
  return result;
};

const mergeArrayOfJson = (...files: string[]): Record<string, any>[] => {
  const result = files.reduce((acc: Record<string, any>[], val: string) => {
    const json = JSON.parse(fs.readFileSync(val, 'utf-8'));
    return [...acc, ...json];
  }, []);
  return result;
};

export const formatDate = (date: Date, withHour = false): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return withHour
    ? `${year}-${month}-${day} ${hour}:${minute}:${second}`
    : `${year}-${month}-${day}`;
};
