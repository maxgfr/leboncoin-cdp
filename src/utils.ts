export const getNextJsProps = (content: string): Record<string, any> => {
  const regex =
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([^<]+)<\/script>/;
  const match = content.match(regex);
  if (!match?.[1]) {
    throw new Error('Could not extract __NEXT_DATA__ from page content');
  }
  return JSON.parse(match[1]);
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

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
