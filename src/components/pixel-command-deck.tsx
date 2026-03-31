"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PixelNodeSnapshot = {
  id: string;
  label: string;
  status: "idle" | "busy" | "warning" | "done";
};

type PixelCommandDeckProps = {
  className?: string;
  language?: "zh-HK" | "en-US";
  projectName?: string | null;
  connectionLabel?: string;
  agentsOnline?: number;
  runningTasks?: number;
  nodes?: PixelNodeSnapshot[];
};

type SceneNode = PixelNodeSnapshot & {
  x: number;
  y: number;
};

type SceneEdge = {
  from: string;
  to: string;
};

type DeckLanguage = "zh-HK" | "en-US";

const CANVAS_WIDTH = 176;
const CANVAS_HEIGHT = 112;
const FPS_CAP = 12;

const layoutNodes = [
  { id: "n1", x: 26, y: 18 },
  { id: "n2", x: 74, y: 18 },
  { id: "n3", x: 124, y: 22 },
  { id: "n4", x: 44, y: 62 },
  { id: "n5", x: 92, y: 62 },
  { id: "n6", x: 142, y: 66 }
] as const;

const edges: SceneEdge[] = [
  { from: "n1", to: "n2" },
  { from: "n2", to: "n3" },
  { from: "n2", to: "n4" },
  { from: "n3", to: "n5" },
  { from: "n4", to: "n5" },
  { from: "n5", to: "n6" }
];

const packets = [
  { route: ["n1", "n2", "n4", "n5"], speed: 0.12, offset: 0.1, color: "#68f0ff" },
  { route: ["n2", "n3", "n5", "n6"], speed: 0.16, offset: 0.45, color: "#78ffb7" },
  { route: ["n1", "n2", "n3"], speed: 0.09, offset: 0.72, color: "#ffcb6b" }
] as const;

const agents = [
  { lane: ["n4", "n5", "n6"], speed: 0.08, offset: 0.18, tint: "#ff8ca5" },
  { lane: ["n2", "n4"], speed: 0.06, offset: 0.52, tint: "#9c9cff" },
  { lane: ["n3", "n5"], speed: 0.05, offset: 0.76, tint: "#8df1ff" }
] as const;

const deckCopy = {
  "zh-HK": {
    panelKicker: "实时公司栅格",
    title: "低负载动态指挥舱",
    canvasAriaLabel: "Agent Company 像素工作流看板",
    project: "项目",
    noProjectSelected: "尚未选择项目",
    agentsOnline: "在线 Agent",
    runningTasks: "运行中任务",
    footerFps: "12 FPS 封顶像素循环",
    footerHidden: "切到后台标签页会暂停绘制",
    footerNodes: "节点状态由实时数据驱动",
    fpsCapSuffix: "FPS 上限",
    canvasLiveOps: "LIVE OPS // SSE",
    canvasPaused: "PAUSED",
    canvasRunning: "RUNNING",
    legendTitle: "这张图怎么看",
    legendLead: "这不是正式流程编辑器，而是把当前项目的执行状态压缩成一张可快速扫读的实时概览。",
    legendItems: [
      { label: "节点方块", detail: "代表任务阶段或角色站位，亮起说明最近有动作。" },
      { label: "连线与流光", detail: "代表任务在节点之间流转，越活跃越接近实时执行。" },
      { label: "右上徽章", detail: "SSE 已连接表示这个页面正持续接收后端事件。" }
    ],
    statusTitle: "颜色含义",
    statusItems: [
      { tone: "busy", label: "绿色", detail: "正在运行，或者刚刚收到新的进度。" },
      { tone: "warning", label: "粉色", detail: "出现阻塞、失败或需要人工处理。" },
      { tone: "done", label: "金色", detail: "已经完成，可以继续推进后续节点。" },
      { tone: "idle", label: "蓝色", detail: "当前空闲，等待触发或排队执行。" }
    ],
    defaultNodes: ["目标", "规划", "研究", "执行", "校验", "发布"]
  },
  "en-US": {
    panelKicker: "Live company raster",
    title: "Low-latency command deck",
    canvasAriaLabel: "Agent Company pixel workflow board",
    project: "Project",
    noProjectSelected: "No project selected",
    agentsOnline: "Agents Online",
    runningTasks: "Running Tasks",
    footerFps: "12 FPS capped pixel loop",
    footerHidden: "background tabs pause drawing",
    footerNodes: "node states come from live data",
    fpsCapSuffix: "FPS cap",
    canvasLiveOps: "LIVE OPS // SSE",
    canvasPaused: "PAUSED",
    canvasRunning: "RUNNING",
    legendTitle: "How to read this",
    legendLead: "This is not the full workflow editor. It is a compact realtime overview of what the selected project is doing right now.",
    legendItems: [
      { label: "Pixel nodes", detail: "Each tile stands for a task stage or role checkpoint." },
      { label: "Lines and packets", detail: "Moving light shows work flowing between nodes." },
      { label: "Top-right badge", detail: "SSE Live means the page is actively receiving backend events." }
    ],
    statusTitle: "Color meaning",
    statusItems: [
      { tone: "busy", label: "Green", detail: "Actively running or receiving fresh progress." },
      { tone: "warning", label: "Rose", detail: "Blocked, failed, or needs attention." },
      { tone: "done", label: "Gold", detail: "Completed and ready for downstream work." },
      { tone: "idle", label: "Blue", detail: "Idle or waiting for a trigger." }
    ],
    defaultNodes: ["GOAL", "PLAN", "RSCH", "EXEC", "QA", "SHIP"]
  }
} as const;

function getDefaultNodes(language: DeckLanguage): PixelNodeSnapshot[] {
  const labels = deckCopy[language].defaultNodes;
  return [
    { id: "n1", label: labels[0], status: "busy" },
    { id: "n2", label: labels[1], status: "busy" },
    { id: "n3", label: labels[2], status: "idle" },
    { id: "n4", label: labels[3], status: "busy" },
    { id: "n5", label: labels[4], status: "warning" },
    { id: "n6", label: labels[5], status: "idle" }
  ];
}

function clampLabel(label: string) {
  const compact = label.replace(/\s+/g, "");
  return compact.slice(0, compact.length > 3 ? 3 : 4).toUpperCase();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getRoutePoint(
  nodeMap: Map<string, SceneNode>,
  route: readonly string[],
  progress: number
) {
  const clamped = ((progress % 1) + 1) % 1;
  const segments = route.length - 1;
  const scaled = clamped * segments;
  const segmentIndex = Math.min(Math.floor(scaled), segments - 1);
  const segmentProgress = scaled - segmentIndex;
  const startNode = nodeMap.get(route[segmentIndex])!;
  const endNode = nodeMap.get(route[segmentIndex + 1])!;

  return {
    x: lerp(startNode.x, endNode.x, segmentProgress),
    y: lerp(startNode.y, endNode.y, segmentProgress)
  };
}

function drawPixelRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string
) {
  context.fillStyle = fillStyle;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawPixelLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fillStyle: string
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  context.fillStyle = fillStyle;

  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(lerp(x1, x2, t));
    const y = Math.round(lerp(y1, y2, t));

    if (step % 2 === 0) {
      context.fillRect(x, y, 1, 1);
    }
  }
}

function getNodeColors(status: SceneNode["status"]) {
  if (status === "busy") {
    return {
      statusColor: "#78ffb7",
      glowColor: "rgba(120,255,183,0.18)"
    };
  }

  if (status === "warning") {
    return {
      statusColor: "#ff8ca5",
      glowColor: "rgba(255,140,165,0.18)"
    };
  }

  if (status === "done") {
    return {
      statusColor: "#ffcb6b",
      glowColor: "rgba(255,203,107,0.16)"
    };
  }

  return {
    statusColor: "#7fb1ff",
    glowColor: "rgba(127,177,255,0.16)"
  };
}

function drawNode(context: CanvasRenderingContext2D, node: SceneNode, pulse: number) {
  const width = 18;
  const height = 12;
  const { statusColor, glowColor } = getNodeColors(node.status);

  drawPixelRect(context, node.x - 9, node.y - 6, width, height, "#0f1728");
  drawPixelRect(context, node.x - 10, node.y - 7, width + 2, 1, "#24324d");
  drawPixelRect(context, node.x - 10, node.y + 6, width + 2, 1, "#24324d");
  drawPixelRect(context, node.x - 10, node.y - 6, 1, height, "#24324d");
  drawPixelRect(context, node.x + 9, node.y - 6, 1, height, "#24324d");
  drawPixelRect(context, node.x - 6, node.y - 3, 12, 2, glowColor);
  drawPixelRect(context, node.x - 4, node.y + 1, 8, 2, statusColor);

  if (pulse > 0.55 && node.status !== "done") {
    drawPixelRect(context, node.x - 1, node.y - 10, 2, 2, statusColor);
  }

  context.fillStyle = "#d6e4ff";
  context.font = '5px "Cascadia Mono", "Courier New", monospace';
  context.fillText(node.label, node.x - 6, node.y + 10);
}

function drawStageBackground(context: CanvasRenderingContext2D, time: number) {
  drawPixelRect(context, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, "#07111f");

  for (let y = 0; y < CANVAS_HEIGHT; y += 8) {
    for (let x = 0; x < CANVAS_WIDTH; x += 8) {
      const drift = Math.sin(time * 0.5 + x * 0.12 + y * 0.08);
      const alpha = 0.06 + Math.max(0, drift) * 0.03;
      drawPixelRect(context, x, y, 1, 1, `rgba(111, 177, 255, ${alpha.toFixed(3)})`);
    }
  }

  drawPixelRect(context, 0, 84, CANVAS_WIDTH, 28, "#08101c");

  for (let x = 0; x < CANVAS_WIDTH; x += 12) {
    const height = 6 + ((x / 12) % 4) * 4;
    drawPixelRect(context, x, 96 - height, 8, height, "rgba(14, 23, 40, 0.88)");
    drawPixelRect(context, x + 2, 98 - height, 2, 2, "rgba(104,240,255,0.24)");
  }
}

export default function PixelCommandDeck({
  className,
  language = "zh-HK",
  projectName,
  connectionLabel = "SSE Live",
  agentsOnline = 0,
  runningTasks = 0,
  nodes
}: PixelCommandDeckProps) {
  const copy = deckCopy[language];
  const defaultNodes = getDefaultNodes(language);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [frameRate, setFrameRate] = useState(FPS_CAP);
  const [canvasScale, setCanvasScale] = useState(3);

  const sceneNodes = useMemo<SceneNode[]>(() => {
    const source = (nodes?.length ? nodes : defaultNodes).slice(0, layoutNodes.length);

    return layoutNodes.map((layoutNode, index) => {
      const snapshot = source[index] ?? defaultNodes[index];
      return {
        id: layoutNode.id,
        label: clampLabel(snapshot.label),
        status: snapshot.status,
        x: layoutNode.x,
        y: layoutNode.y
      };
    });
  }, [defaultNodes, nodes]);

  const nodeMap = useMemo(
    () => new Map(sceneNodes.map((node) => [node.id, node])),
    [sceneNodes]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setIsReducedMotion(mediaQuery.matches);
    const updateVisibility = () => setIsHidden(document.hidden);

    updateReducedMotion();
    updateVisibility();

    mediaQuery.addEventListener("change", updateReducedMotion);
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      mediaQuery.removeEventListener("change", updateReducedMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const updateScale = () => {
      const shell = frame.closest(".stage-shell");
      if (!(shell instanceof HTMLElement)) {
        return;
      }

      const shellStyle = window.getComputedStyle(shell);
      const shellPaddingX =
        parseFloat(shellStyle.paddingLeft || "0") + parseFloat(shellStyle.paddingRight || "0");
      const framePaddingX = 24;
      const availableWidth = shell.clientWidth - shellPaddingX - framePaddingX;
      if (availableWidth <= 0) {
        return;
      }

      const exactScale = availableWidth / CANVAS_WIDTH;
      const nextScale =
        exactScale >= 1 ? Math.max(1, Math.floor(exactScale)) : exactScale;

      setCanvasScale((current) =>
        Math.abs(current - nextScale) < 0.01 ? current : nextScale
      );
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderScale = Math.max(canvasScale, 1);
    canvas.width = Math.round(CANVAS_WIDTH * renderScale * dpr);
    canvas.height = Math.round(CANVAS_HEIGHT * renderScale * dpr);

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(renderScale * dpr, 0, 0, renderScale * dpr, 0, 0);
    context.imageSmoothingEnabled = false;

    let rafId = 0;
    let lastTime = 0;
    const effectiveFps = isReducedMotion ? 5 : FPS_CAP;
    setFrameRate(effectiveFps);

    const render = (timestamp: number) => {
      rafId = window.requestAnimationFrame(render);

      if (isHidden) {
        return;
      }

      const interval = 1000 / effectiveFps;
      if (timestamp - lastTime < interval) {
        return;
      }

      lastTime = timestamp;
      const time = timestamp / 1000;

      drawStageBackground(context, time);

      for (const edge of edges) {
        const fromNode = nodeMap.get(edge.from)!;
        const toNode = nodeMap.get(edge.to)!;
        drawPixelLine(context, fromNode.x, fromNode.y, toNode.x, toNode.y, "rgba(96, 144, 217, 0.72)");
      }

      for (const node of sceneNodes) {
        const pulse = (Math.sin(time * 2 + node.x * 0.15) + 1) / 2;
        drawNode(context, node, pulse);
      }

      for (const packet of packets) {
        const point = getRoutePoint(nodeMap, packet.route, packet.offset + time * packet.speed);
        drawPixelRect(context, point.x - 1, point.y - 1, 3, 3, packet.color);
      }

      for (const agent of agents) {
        const point = getRoutePoint(nodeMap, agent.lane, agent.offset + time * agent.speed);
        drawPixelRect(context, point.x - 2, point.y - 2, 5, 5, "#0d1526");
        drawPixelRect(context, point.x - 1, point.y - 1, 3, 3, agent.tint);
      }

      drawPixelRect(context, 10, 88, 52, 12, "#0d1728");
      context.fillStyle = "#78ffb7";
      context.font = '5px "Cascadia Mono", "Courier New", monospace';
      context.fillText(copy.canvasLiveOps, 14, 96);
      drawPixelRect(context, 118, 10, 44, 10, "#0d1728");
      context.fillStyle = "#ffcb6b";
      context.fillText(isHidden ? copy.canvasPaused : copy.canvasRunning, 124, 17);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [canvasScale, copy.canvasLiveOps, copy.canvasPaused, copy.canvasRunning, isHidden, isReducedMotion, nodeMap, sceneNodes]);

  const displayWidth = Math.max(1, Math.round(CANVAS_WIDTH * canvasScale));
  const displayHeight = Math.max(1, Math.round(CANVAS_HEIGHT * canvasScale));

  return (
    <div className={className}>
      <div className="pixel-stage-header">
        <div>
          <p className="panel-kicker">{copy.panelKicker}</p>
          <h3>{copy.title}</h3>
        </div>
        <div className="pixel-stage-pills">
          <span>{frameRate} {copy.fpsCapSuffix}</span>
          <span>{connectionLabel}</span>
        </div>
      </div>
      <div ref={frameRef} className="pixel-stage-frame">
        <canvas
          ref={canvasRef}
          className="pixel-stage-canvas"
          aria-label={copy.canvasAriaLabel}
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`
          }}
        />
      </div>
      <div className="pixel-stage-readout">
        <div className="pixel-stage-readout-card">
          <span>{copy.project}</span>
          <strong>{projectName ?? copy.noProjectSelected}</strong>
        </div>
        <div className="pixel-stage-readout-card">
          <span>{copy.agentsOnline}</span>
          <strong>{agentsOnline}</strong>
        </div>
        <div className="pixel-stage-readout-card">
          <span>{copy.runningTasks}</span>
          <strong>{runningTasks}</strong>
        </div>
      </div>
      <div className="pixel-stage-footer">
        <span>{copy.footerFps}</span>
        <span>{copy.footerHidden}</span>
        <span>{copy.footerNodes}</span>
      </div>
      <div className="pixel-stage-guide">
        <div className="pixel-guide-card">
          <strong>{copy.legendTitle}</strong>
          <p>{copy.legendLead}</p>
          <div className="pixel-guide-list">
            {copy.legendItems.map((item) => (
              <div key={item.label} className="pixel-guide-item">
                <span>{item.label}</span>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="pixel-guide-card">
          <strong>{copy.statusTitle}</strong>
          <div className="pixel-status-list">
            {copy.statusItems.map((item) => (
              <div key={item.label} className="pixel-status-item">
                <i className={`pixel-status-dot pixel-status-dot--${item.tone}`} />
                <div>
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
