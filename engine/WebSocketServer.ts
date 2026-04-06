// ============================================================
// WebSocketServer — Accepts client connections, broadcasts state
// ============================================================

import { WebSocketServer as WSServer, WebSocket } from "ws";
import type {
  SimulationStatus,
  WorldState,
  WSMessage,
} from "./types.js";

export class WebSocketServer {
  private wss: WSServer | null = null;
  private clients = new Set<WebSocket>();
  private port: number;
  private getState: () => WorldState;
  private getSimulationStatus?: () => SimulationStatus;
  private messageHandlers: Array<(data: string) => void> = [];

  constructor(
    port: number,
    getState: () => WorldState,
    getSimulationStatus?: () => SimulationStatus
  ) {
    this.port = port;
    this.getState = getState;
    this.getSimulationStatus = getSimulationStatus;
  }

  start(): void {
    this.wss = new WSServer({ port: this.port });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(
        `[WS] Client connected (${this.clients.size} total)`
      );

      // Send full state on connect
      const msg: WSMessage = {
        type: "STATE_FULL",
        data: this.getState(),
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(msg));

      if (this.getSimulationStatus) {
        const statusMsg: WSMessage = {
          type: "SIM_STATUS",
          data: this.getSimulationStatus(),
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(statusMsg));
      }

      ws.on("message", (data) => {
        const str = data.toString();
        for (const handler of this.messageHandlers) {
          handler(str);
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(
          `[WS] Client disconnected (${this.clients.size} total)`
        );
      });

      ws.on("error", (err) => {
        console.error("[WS] Client error:", err.message);
        this.clients.delete(ws);
      });
    });

    console.log(`[WS] WebSocket server listening on port ${this.port}`);
  }

  /** Broadcast a message to all connected clients. */
  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  broadcastSimulationStatus(status: SimulationStatus): void {
    this.broadcast({
      type: "SIM_STATUS",
      data: status,
      timestamp: Date.now(),
    });
  }

  /** Register a handler for incoming client messages. */
  onMessage(handler: (data: string) => void): void {
    this.messageHandlers.push(handler);
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
