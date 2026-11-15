import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { APP_NAME, APP_VERSION } from "@/lib/constants";

describe("PotongFeed baseline environment", () => {
  it("mengekspor identitas aplikasi yang benar", () => {
    expect(APP_NAME).toBe("PotongFeed");
    expect(APP_VERSION).toBe("0.1.0");
  });

  it("dapat membuat dan membaca arsip ZIP di memori dengan fflate", () => {
    const zipped = zipSync({
      "01_potongfeed_b1-k1.txt": strToU8("ok"),
    });
    const unzipped = unzipSync(zipped);

    expect(strFromU8(unzipped["01_potongfeed_b1-k1.txt"])).toBe("ok");
  });
});
