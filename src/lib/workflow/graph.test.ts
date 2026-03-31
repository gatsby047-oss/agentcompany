import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  getReadyChildNodeKeys,
  getRootNodeKeys,
  topologicalSort,
  validateWorkflowDefinition
} from "@/lib/workflow/graph";

const workflow = {
  nodes: [
    { nodeKey: "research", title: "Research" },
    { nodeKey: "build", title: "Build" },
    { nodeKey: "review", title: "Review" }
  ],
  edges: [
    { fromNodeKey: "research", toNodeKey: "build" },
    { fromNodeKey: "build", toNodeKey: "review" }
  ]
};

describe("workflow graph helpers", () => {
  it("validates and sorts a DAG", () => {
    const definition = validateWorkflowDefinition(workflow);
    expect(topologicalSort(definition)).toEqual(["research", "build", "review"]);
  });

  it("returns root nodes", () => {
    expect(getRootNodeKeys(workflow)).toEqual(["research"]);
  });

  it("finds newly ready children", () => {
    expect(getReadyChildNodeKeys(["research"], workflow, "research")).toEqual(["build"]);
    expect(getReadyChildNodeKeys(["research", "build"], workflow, "build")).toEqual(["review"]);
  });

  it("calculates progress by averaging nodes", () => {
    expect(calculateProgress([0, 50, 100])).toBe(50);
  });
});
