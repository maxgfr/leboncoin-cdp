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

export const mergeJsonFiles = (...files: string[]): Record<string, any> => {
  const result = files.reduce((acc, val) => {
    const json = JSON.parse(fs.readFileSync(val, 'utf-8'));
    return { ...acc, ...json };
  }, {});
  return result;
};
