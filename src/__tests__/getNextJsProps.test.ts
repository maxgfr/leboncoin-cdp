import { expect, test } from "vitest";
import fs from "fs";
import { getNextJsProps } from "../utils";

test("should works", () => {
  const currentHtml = fs.readFileSync("src/__mocks__/recherche.html").toString();

  expect(getNextJsProps(currentHtml)).toMatchSnapshot();
});
