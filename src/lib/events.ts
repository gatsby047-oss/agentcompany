import { EventEmitter } from "events";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export type SerializedProjectEvent = {
  id: string;
  projectId: string;
  taskRunId: string | null;
  eventType: string;
  payload: Prisma.JsonValue;
  createdAt: string;
};

const broker = global.__agentcompanyProjectEventBroker ?? new EventEmitter();
broker.setMaxListeners(200);
global.__agentcompanyProjectEventBroker = broker;
const REDIS_EVENT_PREFIX = "agentcompany:project-events:";
const emitterId = crypto.randomUUID();

declare global {
  var __agentcompanyProjectEventBroker: EventEmitter | undefined;
  var __agentcompanyProjectEventSubscriber:
    | import("ioredis").default
    | undefined;
  var __agentcompanyProjectEventSubscriberHandler:
    | ((pattern: string, channel: string, message: string) => void)
    | undefined;
  var __agentcompanyProjectEventBridgeStarted: boolean | undefined;
}

function eventChannel(projectId: string) {
  return `project:${projectId}`;
}

function redisProjectChannel(projectId: string) {
  return `${REDIS_EVENT_PREFIX}${projectId}`;
}

function ensureProjectEventBridge() {
  if (global.__agentcompanyProjectEventBridgeStarted) {
    return;
  }

  const subscriber =
    global.__agentcompanyProjectEventSubscriber ?? getRedis().duplicate();

  global.__agentcompanyProjectEventSubscriber = subscriber;
  global.__agentcompanyProjectEventBridgeStarted = true;

  global.__agentcompanyProjectEventSubscriberHandler ??= (_pattern, _channel, message) => {
    try {
      const envelope = JSON.parse(message) as {
        emitterId: string;
        event: SerializedProjectEvent;
      };

      if (envelope.emitterId === emitterId) {
        return;
      }

      broker.emit(eventChannel(envelope.event.projectId), envelope.event);
    } catch (error) {
      console.error("Failed to handle project event broadcast", error);
    }
  };

  subscriber.removeListener("pmessage", global.__agentcompanyProjectEventSubscriberHandler);
  subscriber.on("pmessage", global.__agentcompanyProjectEventSubscriberHandler);

  subscriber.psubscribe(`${REDIS_EVENT_PREFIX}*`).catch((error) => {
    console.error("Failed to subscribe to project event bridge", error);
    global.__agentcompanyProjectEventBridgeStarted = false;
  });
}

export function serializeProjectEvent(record: {
  id: bigint;
  projectId: string;
  taskRunId: string | null;
  eventType: string;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
}): SerializedProjectEvent {
  return {
    id: record.id.toString(),
    projectId: record.projectId,
    taskRunId: record.taskRunId,
    eventType: record.eventType,
    payload: record.payloadJson,
    createdAt: record.createdAt.toISOString()
  };
}

export function publishProjectEvent(event: SerializedProjectEvent) {
  ensureProjectEventBridge();
  broker.emit(eventChannel(event.projectId), event);
  void getRedis()
    .publish(
      redisProjectChannel(event.projectId),
      JSON.stringify({
        emitterId,
        event
      })
    )
    .catch((error) => {
      console.error("Failed to publish project event", error);
    });
}

export function subscribeToProject(projectId: string, listener: (event: SerializedProjectEvent) => void) {
  ensureProjectEventBridge();
  broker.on(eventChannel(projectId), listener);
  return () => {
    broker.off(eventChannel(projectId), listener);
  };
}

export async function createProjectEvent(
  input: {
    projectId: string;
    taskRunId?: string | null;
    eventType: string;
    payload: Prisma.InputJsonValue;
  },
  client: Prisma.TransactionClient | PrismaClient = prisma
) {
  const event = await client.projectEvent.create({
    data: {
      projectId: input.projectId,
      taskRunId: input.taskRunId,
      eventType: input.eventType,
      payloadJson: input.payload
    }
  });

  return serializeProjectEvent(event);
}

export async function emitProjectEvent(input: {
  projectId: string;
  taskRunId?: string | null;
  eventType: string;
  payload: Prisma.InputJsonValue;
}) {
  const event = await createProjectEvent(input);
  publishProjectEvent(event);
  return event;
}

export async function listProjectEvents(projectId: string, afterId?: string | null) {
  const events = await prisma.projectEvent.findMany({
    where: {
      projectId,
      ...(afterId ? { id: { gt: BigInt(afterId) } } : {})
    },
    orderBy: {
      id: "asc"
    },
    take: 200
  });

  return events.map(serializeProjectEvent);
}
