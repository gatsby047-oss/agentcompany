import { ensureProjectAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listProjectEvents, subscribeToProject, SerializedProjectEvent } from "@/lib/events";
import { toErrorResponse } from "@/lib/http";
import {
  createProjectEventStreamState,
  resolveProjectEventsRequest
} from "@/lib/project-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatEvent(event: SerializedProjectEvent) {
  return `id: ${event.id}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureProjectAccess(user.id, params.id);

    const { afterId, wantsJson } = resolveProjectEventsRequest({
      requestUrl: request.url,
      acceptHeader: request.headers.get("accept"),
      lastEventIdHeader: request.headers.get("last-event-id")
    });

    if (wantsJson) {
      const initialEvents = await listProjectEvents(params.id, afterId);

      return Response.json({
        data: initialEvents
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const streamState = createProjectEventStreamState();
        let closed = false;
        let unsubscribe: () => void = () => undefined;

        const send = (event: SerializedProjectEvent) => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(formatEvent(event)));
        };

        const sendLiveEvent = (event: SerializedProjectEvent) => {
          const nextEvent = streamState.pushLiveEvent(event);
          if (nextEvent) {
            send(nextEvent);
          }
        };

        const closeStream = () => {
          if (closed) {
            return;
          }

          closed = true;
          clearInterval(keepAlive);
          unsubscribe();
          request.signal.removeEventListener("abort", abortHandler);

          try {
            controller.close();
          } catch {
            // Ignore close races when the stream is already shutting down.
          }
        };

        const failStream = (error: unknown) => {
          if (closed) {
            return;
          }

          closed = true;
          clearInterval(keepAlive);
          unsubscribe();
          request.signal.removeEventListener("abort", abortHandler);
          controller.error(error);
        };

        const abortHandler = () => {
          closeStream();
        };

        const keepAlive = setInterval(() => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 15_000);

        request.signal.addEventListener("abort", abortHandler);
        unsubscribe = subscribeToProject(params.id, sendLiveEvent);

        try {
          const initialEvents = await listProjectEvents(params.id, afterId);
          if (closed) {
            return;
          }

          streamState.finishReplay(initialEvents).forEach(send);
          controller.enqueue(encoder.encode(`retry: 5000\n\n`));
        } catch (error) {
          failStream(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
