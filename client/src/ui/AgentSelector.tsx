// ============================================================
// AgentSelector — Clickable agent pills + follow mode HUD
// Shows all agents. Click to follow. Escape to exit.
// ============================================================

import { useWorldStore } from "../store/useWorldStore";

const AGENT_COLORS: Record<string, string> = {
  alice: "#e91e63",
  bob: "#2196f3",
};

const ACTION_LABELS: Record<string, string> = {
  chop_wood: "Chopping wood",
  gather_fruit: "Gathering fruit",
  gather_stones: "Collecting stones",
  gather_clay: "Digging clay",
  fish: "Fishing",
  eat: "Eating",
  build_campfire: "Building fire",
  build_shelter: "Building shelter",
  build_wall: "Building wall",
  plant_crop: "Planting",
  harvest_crop: "Harvesting",
  move: "Walking",
  sleep: "Sleeping",
  rest: "Resting",
};

export function AgentSelector() {
  const world = useWorldStore((s) => s.world);
  const followAgent = useWorldStore((s) => s.followAgent);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);
  const agentTasks = useWorldStore((s) => s.agentTasks);

  if (!world) return null;

  // Gather all unique agent IDs from zones
  const agentIds = new Set<string>();
  for (const zone of Object.values(world.zones)) {
    for (const a of zone.agents) agentIds.add(a);
  }
  const agents = Array.from(agentIds).sort();

  // Find which zone each agent is in
  const agentZones: Record<string, string> = {};
  for (const zone of Object.values(world.zones)) {
    for (const a of zone.agents) {
      agentZones[a] = zone.name;
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "flex-end",
      }}
    >
      {/* Following banner */}
      {followAgent && (
        <div
          style={{
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(6px)",
            color: "white",
            padding: "6px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "'Inter', system-ui, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ opacity: 0.6 }}>Following</span>
          <span
            style={{
              fontWeight: 700,
              textTransform: "capitalize",
              color: AGENT_COLORS[followAgent] || "#fff",
            }}
          >
            {followAgent}
          </span>
          <button
            onClick={() => setFollowAgent(null)}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            ESC
          </button>
        </div>
      )}

      {/* Agent pills */}
      {agents.map((id) => {
        const isFollowed = followAgent === id;
        const task = agentTasks[id];
        const taskLabel = task
          ? ACTION_LABELS[task.action] || task.action.replace(/_/g, " ")
          : null;
        const zoneName = agentZones[id] || "?";
        const clr = AGENT_COLORS[id] || "#888";

        return (
          <button
            key={id}
            onClick={() => setFollowAgent(isFollowed ? null : id)}
            style={{
              background: isFollowed
                ? clr
                : "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)",
              border: isFollowed ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
              color: "white",
              padding: "6px 14px",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 2,
              minWidth: 130,
              transition: "all 0.2s",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: task ? "#4caf50" : "#9e9e9e",
                  display: "inline-block",
                  boxShadow: task ? "0 0 6px #4caf50" : "none",
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "capitalize",
                }}
              >
                {id}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                opacity: 0.7,
                fontFamily: "'Inter', system-ui, sans-serif",
                textAlign: "right",
              }}
            >
              {taskLabel ? (
                <span>
                  {taskLabel}
                  {task!.hours >= 0.5 && (
                    <span style={{ opacity: 0.5 }}> ({task!.hours}h)</span>
                  )}
                </span>
              ) : (
                <span style={{ fontStyle: "italic" }}>Idle</span>
              )}
              <span style={{ opacity: 0.4 }}> @ {zoneName}</span>
            </div>
          </button>
        );
      })}

      {/* Hint when no one is followed */}
      {!followAgent && agents.length > 0 && (
        <div
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.35)",
            fontFamily: "'Inter', system-ui, sans-serif",
            textAlign: "right",
          }}
        >
          Click agent to follow
        </div>
      )}
    </div>
  );
}
