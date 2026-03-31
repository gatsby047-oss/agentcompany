import { AgentAdapter } from "@/lib/adapters/types";
import { getEnv } from "@/lib/env";

export const openClawAdapter: AgentAdapter = {
  provider: "openclaw",
  async dispatchTask({ agentInstance, taskRun, workflowNode, project, secret }) {
    const response = await fetch(agentInstance.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        taskRunId: taskRun.id,
        projectId: project.id,
        workflowNodeId: workflowNode.id,
        nodeKey: workflowNode.nodeKey,
        title: workflowNode.title,
        input: taskRun.inputJson ?? workflowNode.configJson ?? {},
        callback: {
          url: `${getEnv().APP_URL}/api/agent-callbacks/${agentInstance.provider}`,
          agentInstanceId: agentInstance.id
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Dispatch failed with ${response.status}: ${body}`);
    }
  }
};
