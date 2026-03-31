import { describe, expect, it } from "vitest";
import { getArtifactStorageKey, normalizeArtifactList } from "@/lib/artifacts";

describe("normalizeArtifactList", () => {
  it("returns valid artifact arrays unchanged", () => {
    const artifacts = [
      {
        key: "artifacts/report.json",
        name: "report.json",
        type: "application/json",
        size: 128
      }
    ];

    expect(normalizeArtifactList(artifacts)).toEqual(artifacts);
  });

  it("supports manifests with an items array", () => {
    expect(
      normalizeArtifactList({
        items: [
          {
            key: "artifacts/report.json",
            name: "report.json",
            type: "application/json"
          }
        ]
      })
    ).toEqual([
      {
        key: "artifacts/report.json",
        name: "report.json",
        type: "application/json"
      }
    ]);
  });

  it("drops payloads that are not valid artifact descriptors", () => {
    expect(normalizeArtifactList({ foo: "bar" })).toEqual([]);
    expect(normalizeArtifactList([{ foo: "bar" }])).toEqual([]);
  });
});

describe("getArtifactStorageKey", () => {
  it("extracts manifest storage keys when present", () => {
    expect(getArtifactStorageKey({ storageKey: "artifacts/run-1.json" })).toBe(
      "artifacts/run-1.json"
    );
    expect(getArtifactStorageKey({ foo: "bar" })).toBeNull();
  });
});
