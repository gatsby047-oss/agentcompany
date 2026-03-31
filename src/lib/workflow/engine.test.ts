import { describe, expect, it } from "vitest";
import { TaskRunStatus } from "@prisma/client";
import { canProcessTaskCallback } from "@/lib/workflow/engine";

describe("canProcessTaskCallback", () => {
  it("allows queued and running task callbacks to proceed", () => {
    expect(canProcessTaskCallback(TaskRunStatus.QUEUED, "started")).toBe(true);
    expect(canProcessTaskCallback(TaskRunStatus.QUEUED, "completed")).toBe(true);
    expect(canProcessTaskCallback(TaskRunStatus.RUNNING, "progress")).toBe(true);
    expect(canProcessTaskCallback(TaskRunStatus.RUNNING, "failed")).toBe(true);
  });

  it("ignores callbacks for terminal task states", () => {
    expect(canProcessTaskCallback(TaskRunStatus.COMPLETED, "progress")).toBe(false);
    expect(canProcessTaskCallback(TaskRunStatus.FAILED, "completed")).toBe(false);
    expect(canProcessTaskCallback(TaskRunStatus.BLOCKED, "started")).toBe(false);
  });
});
