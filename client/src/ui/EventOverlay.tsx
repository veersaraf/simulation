// ============================================================
// EventOverlay — Live narration feed on the 3D scene
// ============================================================

import { useWorldStore } from "../store/useWorldStore";

export function EventOverlay() {
  const events = useWorldStore((s) => s.events);
  const world = useWorldStore((s) => s.world);

  // Show last 6 events
  const recent = events.slice(-6);

  const time = world?.meta.time ?? "day";
  const season = world?.meta.season ?? "spring";
  const hour = world?.meta.hour ?? null;
  const minute = world?.meta.minute ?? null;
  const worldDays = world?.meta.worldDays ?? null;

  const clockStr =
    hour !== null && minute !== null
      ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 60,
        left: 16,
        zIndex: 50,
        maxWidth: 480,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {/* Time/Season badge */}
      {world && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <TimeBadge time={time} />
          <SeasonBadge season={season} />
          {clockStr !== null && (
            <span
              style={{
                background: "rgba(0,0,0,0.5)",
                color: "rgba(255,255,255,0.85)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              {clockStr}
            </span>
          )}
          {worldDays !== null && (
            <span
              style={{
                background: "rgba(0,0,0,0.4)",
                color: "rgba(255,255,255,0.5)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Day {worldDays}
            </span>
          )}
        </div>
      )}

      {recent.length === 0 && (
        <div
          style={{
            background: "rgba(0,0,0,0.4)",
            color: "rgba(255,255,255,0.3)",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Waiting for events...
        </div>
      )}

      {recent.map((ev, i) => {
        const opacity = 0.25 + (i / recent.length) * 0.75;
        const { label, text, color } = formatEvent(ev);
        if (!text || color === "transparent") return null;

        return (
          <div
            key={`${ev.timestamp}-${i}`}
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)",
              color,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "'Inter', system-ui, sans-serif",
              lineHeight: 1.4,
              opacity,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              borderLeft: `2px solid ${color}`,
            }}
          >
            <span
              style={{
                opacity: 0.6,
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {label}
            </span>{" "}
            {text}
          </div>
        );
      })}
    </div>
  );
}

function formatEvent(ev: {
  type: string;
  payload: unknown;
  source: string;
}): { label: string; text: string; color: string } {
  const p = ev.payload as Record<string, unknown> | string;

  switch (ev.type) {
    case "WORLD_EVENT":
      return {
        label: "World",
        text: typeof p === "string" ? p.slice(0, 120) : String(p).slice(0, 120),
        color: "#a5d6a7",
      };
    case "AGENT_ACTION": {
      const obj = p as Record<string, unknown>;
      const agent = String(obj.agent || ev.source || "?");
      const action = String(obj.action || "?").replace(/_/g, " ");
      const target = obj.target ? ` ${obj.target}` : "";
      return {
        label: agent,
        text: `${action}${target}`,
        color: "#ffcc80",
      };
    }
    case "AGENT_MESSAGE": {
      const obj = p as Record<string, unknown>;
      const from = String(obj.from || ev.source || "?");
      const to = String(obj.to || "");
      const msg = String(obj.message || "").slice(0, 100);
      // "narrator" target = agent thinking aloud, not a real message
      if (to === "narrator") {
        return {
          label: from,
          text: `${msg}`,
          color: "#b0bec5",
        };
      }
      return {
        label: `${from} to ${to}`,
        text: `"${msg}"`,
        color: "#90caf9",
      };
    }
    case "POSITION_UPDATE": {
      const obj = p as Record<string, unknown>;
      return {
        label: String(obj.agent || ev.source),
        text: `moved to ${obj.to || "?"}`,
        color: "#ce93d8",
      };
    }
    case "ACTION_COMPLETE": {
      const obj = typeof p === "object" && p !== null ? p as Record<string, unknown> : {};
      const agent = String(obj.agent || ev.source || "?");
      const action = String(obj.action || "?").replace(/_/g, " ");
      const result = typeof obj.result === "string" ? obj.result.slice(0, 80) : "";
      return {
        label: agent,
        text: result || `finished ${action}`,
        color: "#80cbc4",
      };
    }
    case "TASK_START": {
      const obj = typeof p === "object" && p !== null ? p as Record<string, unknown> : {};
      const agent = String(obj.agent || ev.source || "?");
      const action = String(obj.action || "?").replace(/_/g, " ");
      const hours = obj.hours ? ` for ${obj.hours}h` : "";
      return {
        label: agent,
        text: `started ${action}${hours}`,
        color: "#ffe082",
      };
    }
    case "TASK_END":
      // Don't show task end as a separate event — it's implied by task start completion
      return { label: "", text: "", color: "transparent" };
    default:
      return {
        label: ev.source || ev.type,
        text:
          typeof p === "string"
            ? p.slice(0, 100)
            : JSON.stringify(p).slice(0, 100),
        color: "rgba(255,255,255,0.6)",
      };
  }
}

function TimeBadge({ time }: { time: string }) {
  const config: Record<string, { icon: string; bg: string; color: string }> = {
    dawn: { icon: "🌅", bg: "rgba(255,152,0,0.3)", color: "#ffcc80" },
    day: { icon: "☀️", bg: "rgba(255,235,59,0.2)", color: "#fff176" },
    dusk: { icon: "🌇", bg: "rgba(156,39,176,0.3)", color: "#ce93d8" },
    night: { icon: "🌙", bg: "rgba(26,35,126,0.4)", color: "#90caf9" },
  };
  const c = config[time] || config.day;
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 600,
      }}
    >
      {c.icon} {time}
    </span>
  );
}

function SeasonBadge({ season }: { season: string }) {
  const config: Record<string, { icon: string; bg: string; color: string }> = {
    spring: { icon: "🌸", bg: "rgba(76,175,80,0.3)", color: "#a5d6a7" },
    summer: { icon: "🌿", bg: "rgba(46,125,50,0.3)", color: "#81c784" },
    autumn: { icon: "🍂", bg: "rgba(230,81,0,0.3)", color: "#ffcc80" },
    winter: { icon: "❄️", bg: "rgba(144,164,174,0.3)", color: "#b0bec5" },
  };
  const c = config[season] || config.spring;
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 600,
      }}
    >
      {c.icon} {season}
    </span>
  );
}
