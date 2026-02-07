import fs from 'fs';

export const getNextJsProps = (content: string): Record<string, any> => {
  const regex =
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([^<]+)<\/script>/;
  const match = content.match(regex);
  if (!match?.[1]) {
    throw new Error('Could not extract __NEXT_DATA__ from page content');
  }
  return JSON.parse(match[1]);
};

export const getPhoneNumber = (content: string): string | undefined => {
  const parts = content.split('tel:');
  return parts[1]?.slice(0, 10);
};

export const mergeAllAssetsJsonFiles = (
  fileName: string,
  lastId: number,
  isForSave = true,
) => {
  const files = Array.from(
    { length: lastId },
    (_, i) => `./assets/${fileName}_${i + 1}.json`,
  );
  const result = files.reduce<Record<string, any>[]>((acc, file) => {
    const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return [...acc, ...json];
  }, []);
  if (isForSave) {
    fs.writeFileSync(
      `./assets/${fileName}.json`,
      JSON.stringify(result, null, 2),
    );
  }
  return result;
};

export const formatDate = (date: Date, withHour = false): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (!withHour) return `${year}-${month}-${day}`;
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

export const chunkArray = <T>(array: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size),
  );
};

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
