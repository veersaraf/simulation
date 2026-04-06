// ============================================================
// App — Root component
// ============================================================

import { useWebSocket } from "./hooks/useWebSocket";
import { WorldScene } from "./scene/WorldScene";
import { MonitorPanel } from "./ui/MonitorPanel";
import { EventOverlay } from "./ui/EventOverlay";
import { AgentSelector } from "./ui/AgentSelector";

function App() {
  useWebSocket();

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* 3D World */}
      <WorldScene />

      {/* Monitor overlay */}
      <MonitorPanel />

      {/* Event log on 3D scene */}
      <EventOverlay />

      {/* Agent selector / follow mode */}
      <AgentSelector />

      {/* Controls hint */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 50,
          color: "rgba(255,255,255,0.4)",
          fontSize: 12,
          fontFamily: "'Inter', system-ui, sans-serif",
          lineHeight: 1.6,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Click to enable camera | WASD move | Mouse look | Scroll zoom
        <br />
        Space / Ctrl — up / down | Shift — sprint | Click agent — follow | Esc — exit
      </div>
    </div>
  );
}

export default App;
