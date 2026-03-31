import { describe, expect, it } from "vitest";
import type { SerializedProjectEvent } from "@/lib/events";
import {
  createProjectEventStreamState,
  resolveProjectEventsRequest
} from "@/lib/project-events";

function createEvent(id: string, eventType: string): SerializedProjectEvent {
  return {
    id,
    projectId: "project-1",
    taskRunId: null,
    eventType,
    payload: {},
    createdAt: "2026-03-29T00:00:00.000Z"
  };
}

describe("resolveProjectEventsRequest", () => {
  it("prefers the Last-Event-ID header over query parameters", () => {
    expect(
      resolveProjectEventsRequest({
        requestUrl: "https://example.com/api/projects/1/events?after=10",
        acceptHeader: "text/event-stream",
        lastEventIdHeader: "42"
      })
    ).toEqual({
      afterId: "42",
      wantsJson: false
    });
  });

  it("detects JSON recovery requests from the Accept header", () => {
    expect(
      resolveProjectEventsRequest({
        requestUrl: "https://example.com/api/projects/1/events?after=10",
        acceptHeader: "application/json, text/plain, */*",
        lastEventIdHeader: null
      })
    ).toEqual({
      afterId: "10",
      wantsJson: true
    });
  });
});

describe("createProjectEventStreamState", () => {
  it("deduplicates events that appear in both replay and live delivery", () => {
    const streamState = createProjectEventStreamState();
    const queuedEvent = createEvent("10", "task.queued");
    const startedEvent = createEvent("11", "task.started");

    expect(streamState.pushLiveEvent(queuedEvent)).toBeNull();

    expect(streamState.finishReplay([queuedEvent, startedEvent])).toEqual([
      queuedEvent,
      startedEvent
    ]);
    expect(streamState.pushLiveEvent(startedEvent)).toBeNull();
  });

  it("keeps live events that arrive after subscription but before replay finishes", () => {
    const streamState = createProjectEventStreamState();
    const queuedEvent = createEvent("20", "task.queued");
    const startedEvent = createEvent("21", "task.started");
    const completedEvent = createEvent("22", "task.completed");

    expect(streamState.pushLiveEvent(completedEvent)).toBeNull();

    expect(streamState.finishReplay([queuedEvent, startedEvent])).toEqual([
      queuedEvent,
      startedEvent,
      completedEvent
    ]);
  });
});
