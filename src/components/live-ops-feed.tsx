"use client";

import { useEffect, useState } from "react";

export type FeedItem = {
  id?: string;
  time: string;
  tag: string;
  title: string;
  detail: string;
};

type LiveOpsFeedProps = {
  items: FeedItem[];
  language?: "zh-HK" | "en-US";
  emptyTitle?: string;
  emptyDetail?: string;
};

const feedCopy = {
  "zh-HK": {
    panelKicker: "当前事件焦点",
    defaultEmptyTitle: "等待第一条事件",
    defaultEmptyDetail: "工作流启动后，这里会持续显示 task.*、workflow.*、agent.* 事件。",
    ariaLabel: "实时运营事件"
  },
  "en-US": {
    panelKicker: "Active event focus",
    defaultEmptyTitle: "Waiting for the first event",
    defaultEmptyDetail:
      "Once a workflow starts, task.*, workflow.*, and agent.* events will stream here.",
    ariaLabel: "Live operations events"
  }
} as const;

export default function LiveOpsFeed({
  items,
  language = "zh-HK",
  emptyTitle,
  emptyDetail
}: LiveOpsFeedProps) {
  const copy = feedCopy[language];
  const [activeIndex, setActiveIndex] = useState(0);
  const fallbackItem: FeedItem = {
    id: "idle",
    time: "--:--",
    tag: "stream.idle",
    title: emptyTitle ?? copy.defaultEmptyTitle,
    detail: emptyDetail ?? copy.defaultEmptyDetail
  };
  const safeItems = items.length > 0 ? items : [fallbackItem];

  useEffect(() => {
    if (safeItems.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeItems.length);
    }, 2600);

    return () => {
      window.clearInterval(timer);
    };
  }, [safeItems.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  const activeItem = safeItems[activeIndex] ?? fallbackItem;

  return (
    <div className="ops-feed">
      <div className="ops-feed-hero">
        <div>
          <p className="panel-kicker">{copy.panelKicker}</p>
          <h3>{activeItem.title}</h3>
        </div>
        <span className="ops-feed-badge">{activeItem.tag}</span>
      </div>
      <p className="ops-feed-detail">{activeItem.detail}</p>
      <div className="ops-feed-list" role="list" aria-label={copy.ariaLabel}>
        {safeItems.map((item, index) => (
          <div
            key={item.id ?? `${item.time}-${item.title}`}
            role="listitem"
            className={`ops-feed-row ${index === activeIndex ? "is-active" : ""}`}
          >
            <span className="ops-feed-time">{item.time}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
