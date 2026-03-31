import type { SerializedProjectEvent } from "@/lib/events";

export function resolveProjectEventsRequest(input: {
  requestUrl: string;
  acceptHeader: string | null;
  lastEventIdHeader: string | null;
}) {
  const url = new URL(input.requestUrl);
  const afterId =
    input.lastEventIdHeader ??
    url.searchParams.get("after") ??
    url.searchParams.get("afterId");
  const acceptHeader = input.acceptHeader?.toLowerCase() ?? "";
  const wantsJson = acceptHeader
    .split(",")
    .map((part) => part.trim())
    .some((part) => part.includes("application/json"));

  return {
    afterId,
    wantsJson
  };
}

function takeUnseenProjectEvent(
  event: SerializedProjectEvent,
  seenEventIds: Set<string>
) {
  if (seenEventIds.has(event.id)) {
    return null;
  }

  seenEventIds.add(event.id);
  return event;
}

export function createProjectEventStreamState() {
  const seenEventIds = new Set<string>();
  const bufferedLiveEvents: SerializedProjectEvent[] = [];
  let replayCompleted = false;

  return {
    pushLiveEvent(event: SerializedProjectEvent) {
      if (!replayCompleted) {
        bufferedLiveEvents.push(event);
        return null;
      }

      return takeUnseenProjectEvent(event, seenEventIds);
    },
    finishReplay(initialEvents: SerializedProjectEvent[]) {
      replayCompleted = true;
      const mergedEvents = [...initialEvents, ...bufferedLiveEvents];
      bufferedLiveEvents.length = 0;

      return mergedEvents.flatMap((event) => {
        const nextEvent = takeUnseenProjectEvent(event, seenEventIds);
        return nextEvent ? [nextEvent] : [];
      });
    }
  };
}
