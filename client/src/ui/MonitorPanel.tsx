// ============================================================
// MonitorPanel — Full monitoring overlay with event log,
// agent info, user injection, and pause/resume
// ============================================================

import { useState, useRef, useEffect } from "react";
import { useWorldStore } from "../store/useWorldStore";

export function MonitorPanel() {
  const panelOpen = useWorldStore((s) => s.panelOpen);
  const togglePanel = useWorldStore((s) => s.togglePanel);
  const connected = useWorldStore((s) => s.connected);
  const world = useWorldStore((s) => s.world);
  const events = useWorldStore((s) => s.events);
  const simulation = useWorldStore((s) => s.simulation);
  const sendMessage = useWorldStore((s) => s.sendMessage);

  const [userInput, setUserInput] = useState("");
  const eventLogRef = useRef<HTMLDivElement>(null);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  const handleInject = () => {
    if (!userInput.trim()) return;
    sendMessage(JSON.stringify({ type: "USER_INJECT", payload: userInput }));
    setUserInput("");
  };

  const handlePauseResume = () => {
    sendMessage(
      JSON.stringify({ type: simulation.paused ? "RESUME" : "PAUSE" })
    );
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={togglePanel}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 100,
          padding: "8px 16px",
          background: panelOpen
            ? "rgba(255,255,255,0.15)"
            : "rgba(0,0,0,0.6)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 500,
          backdropFilter: "blur(8px)",
          transition: "all 0.2s",
        }}
      >
        {panelOpen ? "Close" : "Monitor"}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: 360,
            height: "100%",
            zIndex: 90,
            background: "rgba(10, 10, 10, 0.88)",
            backdropFilter: "blur(12px)",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            color: "white",
            fontFamily: "'Inter', system-ui, sans-serif",
            padding: "60px 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflowY: "auto",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            World Monitor
          </h2>

          {/* Connection + Pause */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <StatusDot ok={connected} />
            <span style={{ fontSize: 12, opacity: 0.7, flex: 1 }}>
              {connected
                ? simulation.aiEnabled
                  ? simulation.paused
                    ? "Connected · Paused"
                    : simulation.running
                      ? "Connected · Running"
                      : "Connected · Idle"
                  : "Connected · Static Mode"
                : "Disconnected"}
            </span>
            <button
              onClick={handlePauseResume}
              disabled={!simulation.aiEnabled}
              style={{
                padding: "4px 12px",
                background: simulation.paused
                  ? "rgba(76,175,80,0.3)"
                  : "rgba(244,67,54,0.3)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                cursor: simulation.aiEnabled ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: 500,
                opacity: simulation.aiEnabled ? 1 : 0.5,
              }}
            >
              {simulation.paused ? "Resume" : "Pause"}
            </button>
          </div>

          {/* World Info */}
          {world && (
            <Section title="World">
              <InfoRow label="Name" value={world.meta.name} />
              <InfoRow
                label="Zones"
                value={String(Object.keys(world.zones).length)}
              />
              <InfoRow label="Tick" value={String(world.meta.tick)} />
              <InfoRow label="Time" value={world.meta.time} />
              <InfoRow label="Season" value={world.meta.season} />
            </Section>
          )}

          {/* Agent Info */}
          {world && (
            <Section title="Agents">
              {Object.values(world.zones)
                .flatMap((z) => z.agents.map((a) => ({ agent: a, zone: z })))
                .map(({ agent, zone }) => (
                  <div
                    key={agent}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          background:
                            agent === "alice" ? "#e91e63" : "#2196f3",
                          color: "white",
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {agent}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>
                        @ {zone.name}
                      </span>
                    </div>
                  </div>
                ))}
            </Section>
          )}

          {/* Zone Occupancy */}
          {world && (
            <Section title="Zone Occupancy">
              {Object.values(world.zones)
                .filter((z) => z.structures.length > 0 || z.agents.length > 0)
                .map((zone) => (
                  <div
                    key={zone.id}
                    style={{ fontSize: 11, padding: "3px 0", opacity: 0.7 }}
                  >
                    <strong>{zone.name}</strong>
                    {zone.agents.length > 0 && (
                      <span> — {zone.agents.join(", ")}</span>
                    )}
                    {zone.structures.length > 0 && (
                      <span style={{ color: "#ffb74d" }}>
                        {" "}
                        [{zone.structures.join(", ")}]
                      </span>
                    )}
                  </div>
                ))}
            </Section>
          )}

          {/* Event Log */}
          <Section title={`Event Log (${events.length})`}>
            <div
              ref={eventLogRef}
              style={{
                maxHeight: 200,
                overflowY: "auto",
                fontSize: 10,
                lineHeight: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {events.length === 0 && (
                <span style={{ opacity: 0.3 }}>No events yet...</span>
              )}
              {events.slice(-30).map((ev, i) => (
                <div
                  key={i}
                  style={{
                    padding: "2px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    color: getEventColor(ev.type),
                  }}
                >
                  <span style={{ opacity: 0.4 }}>
                    [{ev.type.replace("_", " ")}]
                  </span>{" "}
                  {formatPayload(ev.payload)}
                </div>
              ))}
            </div>
          </Section>

          {/* User Injection */}
          <Section title="Inject Event">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInject()}
                placeholder="Type a message to all agents..."
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  color: "white",
                  fontSize: 12,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  outline: "none",
                }}
              />
              <button
                onClick={handleInject}
                style={{
                  padding: "6px 12px",
                  background: "rgba(33,150,243,0.4)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Send
              </button>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}

// --- Helper Components ---

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.4,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok ? "#4caf50" : "#f44336",
      }}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.4 }}>{label}</span>
      <span style={{ fontWeight: 500, textTransform: "capitalize" }}>
        {value}
      </span>
    </div>
  );
}

function getEventColor(type: string): string {
  switch (type) {
    case "WORLD_EVENT":
      return "#81c784";
    case "AGENT_ACTION":
      return "#ffb74d";
    case "AGENT_MESSAGE":
      return "#64b5f6";
    case "POSITION_UPDATE":
      return "#ce93d8";
    case "USER_INJECT":
      return "#ef5350";
    default:
      return "rgba(255,255,255,0.6)";
  }
}

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") return payload.slice(0, 80);
  if (typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    if (p.message) return String(p.message).slice(0, 80);
    if (p.action) return `${p.agent || ""} → ${p.action} ${p.target || ""}`.trim();
    return JSON.stringify(p).slice(0, 80);
  }
  return String(payload).slice(0, 80);
}
