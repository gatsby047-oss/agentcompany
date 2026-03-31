import { z } from "zod";
import { badRequest } from "@/lib/http";

export const workflowNodeDefinitionSchema = z.object({
  nodeKey: z.string().min(1),
  title: z.string().min(1),
  targetMembershipId: z.string().min(1).nullable().optional(),
  config: z.record(z.any()).optional()
});

export const workflowEdgeDefinitionSchema = z.object({
  fromNodeKey: z.string().min(1),
  toNodeKey: z.string().min(1)
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(workflowNodeDefinitionSchema).min(1),
  edges: z.array(workflowEdgeDefinitionSchema).default([])
});

export type WorkflowDefinitionInput = z.infer<typeof workflowDefinitionSchema>;

export function validateWorkflowDefinition(input: WorkflowDefinitionInput) {
  const parsed = workflowDefinitionSchema.parse(input);
  const keySet = new Set<string>();

  for (const node of parsed.nodes) {
    if (keySet.has(node.nodeKey)) {
      throw badRequest(`Duplicate node key: ${node.nodeKey}`);
    }

    keySet.add(node.nodeKey);
  }

  for (const edge of parsed.edges) {
    if (!keySet.has(edge.fromNodeKey) || !keySet.has(edge.toNodeKey)) {
      throw badRequest("Every workflow edge must point to an existing node");
    }

    if (edge.fromNodeKey === edge.toNodeKey) {
      throw badRequest("Workflow edges cannot self-reference");
    }
  }

  topologicalSort(parsed);
  return parsed;
}

export function topologicalSort(definition: WorkflowDefinitionInput) {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of definition.nodes) {
    inDegree.set(node.nodeKey, 0);
    adjacency.set(node.nodeKey, []);
  }

  for (const edge of definition.edges) {
    adjacency.get(edge.fromNodeKey)?.push(edge.toNodeKey);
    inDegree.set(edge.toNodeKey, (inDegree.get(edge.toNodeKey) ?? 0) + 1);
  }

  const queue = Array.from(inDegree.entries())
    .filter(([, count]) => count === 0)
    .map(([nodeKey]) => nodeKey);

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const next of adjacency.get(current) ?? []) {
      const nextCount = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  if (result.length !== definition.nodes.length) {
    throw badRequest("Workflow definition must be a DAG");
  }

  return result;
}

export function getRootNodeKeys(definition: WorkflowDefinitionInput) {
  const incoming = new Set(definition.edges.map((edge) => edge.toNodeKey));
  return definition.nodes.filter((node) => !incoming.has(node.nodeKey)).map((node) => node.nodeKey);
}

export function getReadyChildNodeKeys(
  completedNodeKeys: string[],
  definition: WorkflowDefinitionInput,
  parentNodeKey: string
) {
  const completedSet = new Set(completedNodeKeys);
  const childKeys = definition.edges
    .filter((edge) => edge.fromNodeKey === parentNodeKey)
    .map((edge) => edge.toNodeKey);

  return childKeys.filter((childKey) => {
    const parentKeys = definition.edges
      .filter((edge) => edge.toNodeKey === childKey)
      .map((edge) => edge.fromNodeKey);

    return parentKeys.every((parentKey) => completedSet.has(parentKey));
  });
}

export function calculateProgress(progressValues: number[]) {
  if (progressValues.length === 0) {
    return 0;
  }

  return Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length);
}
