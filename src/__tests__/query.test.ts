import { describe, it, expect } from "vitest";
import { normalizeSearchInput, buildQueryString } from "../query";

const BASE = "https://www.leboncoin.fr";

describe("normalizeSearchInput", () => {
  it("translates a /carte map URL into the canonical /recherche query", () => {
    // Real map-view URL: lat/lng/city/defaultRadius instead of `locations`.
    const input =
      "https://www.leboncoin.fr/carte/ventes_immobilieres?lat=45.785791226648406&lng=3.093987259418718&real_estate_type=1&square=80-150&bedrooms=5-5&price=min-300000&city=Clermont-Ferrand&defaultRadius=6650";

    const { params, isMap, navigateUrl } = normalizeSearchInput(input, BASE);

    expect(isMap).toBe(true);
    // First navigation uses the user's actual map page (has searchResult).
    expect(navigateUrl).toBe(input);

    // Map-only keys are stripped; geo is folded into a single `locations` value.
    expect(params.get("lat")).toBeNull();
    expect(params.get("lng")).toBeNull();
    expect(params.get("city")).toBeNull();
    expect(params.get("defaultRadius")).toBeNull();
    expect(params.get("locations")).toBe("Clermont-Ferrand__45.785791226648406_3.093987259418718_6650");

    // Filters are preserved verbatim (bedrooms, NOT rooms).
    expect(params.get("real_estate_type")).toBe("1");
    expect(params.get("square")).toBe("80-150");
    expect(params.get("bedrooms")).toBe("5-5");
    expect(params.get("price")).toBe("min-300000");

    // With the category id read from the page, the pagination query matches
    // the one proven to return the correct (filtered) result set.
    const query = new URLSearchParams(buildQueryString(params, "9"));
    expect(query.get("category")).toBe("9");
    expect(query.get("locations")).toBe("Clermont-Ferrand__45.785791226648406_3.093987259418718_6650");
    expect(query.get("bedrooms")).toBe("5-5");
  });

  it("detects map view from lat/lng even without a /carte path", () => {
    const { isMap, params } = normalizeSearchInput("category=9&lat=45.78&lng=3.09&defaultRadius=5000&city=Clermont-Ferrand", BASE);
    expect(isMap).toBe(true);
    expect(params.get("locations")).toBe("Clermont-Ferrand__45.78_3.09_5000");
    expect(params.get("lat")).toBeNull();
  });

  it("passes a raw /recherche query through unchanged", () => {
    const raw = "category=9&locations=75012__48.84105_2.38928_5000&price=150000-300000";
    const { params, isMap, navigateUrl } = normalizeSearchInput(raw, BASE);

    expect(isMap).toBe(false);
    expect(params.get("category")).toBe("9");
    expect(params.get("locations")).toBe("75012__48.84105_2.38928_5000");
    expect(navigateUrl).toBe(`${BASE}/recherche?${params.toString()}`);
  });

  it("accepts a full /recherche URL and keeps its category", () => {
    const url = `${BASE}/recherche?category=2&locations=Lyon&price=0-10000`;
    const { params, isMap, navigateUrl } = normalizeSearchInput(url, BASE);

    expect(isMap).toBe(false);
    expect(navigateUrl).toBe(url);
    expect(buildQueryString(params, "9")).toContain("category=2"); // existing id wins
  });

  it("accepts a path+query form", () => {
    const { params, isMap } = normalizeSearchInput("recherche?category=15&text=mac", BASE);
    expect(isMap).toBe(false);
    expect(params.get("category")).toBe("15");
    expect(params.get("text")).toBe("mac");
  });
});

describe("buildQueryString", () => {
  it("injects the category id only when absent", () => {
    expect(buildQueryString(new URLSearchParams("a=1"), "9")).toContain("category=9");
    expect(buildQueryString(new URLSearchParams("category=2"), "9")).toContain("category=2");
  });
});
