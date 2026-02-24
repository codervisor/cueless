import { randomUUID } from "crypto";
import { AgentConfig } from "../../config";
import { EventBus } from "../../events/eventBus";
import { AgentSession, TranscriptSessionState, TranscriptTurn } from "./types";
import { CommandRunner, spawnAndStream, stripAnsi } from "./utils";

const DEFAULT_MAX_TURNS = 10;

export const buildPrompt = (turns: TranscriptTurn[], userText: string): string => {
  if (turns.length === 0) {
    return userText;
  }

  const history = turns
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n");

  return `Previous conversation:\n${history}\n\nUser: ${userText}`;
};

export class CopilotSession implements AgentSession {
  readonly sessionId = randomUUID();
  private readonly state: TranscriptSessionState = { strategy: "transcript", turns: [] };

  constructor(
    readonly channelId: string,
    readonly chatId: string,
    private readonly config: AgentConfig,
    private readonly run: CommandRunner = spawnAndStream
  ) { }

  async send(userText: string, executionId: string, eventBus: EventBus): Promise<string> {
    const prompt = buildPrompt(this.state.turns, userText);

    const args = [
      ...(this.config.args || []),
      "-p",
      prompt
    ];

    const result = await this.run(
      this.config.command,
      args,
      {
        cwd: this.config.workingDir,
        env: this.config.env,
        timeoutMs: this.config.timeoutMs
      },
      (type, text) => {
        eventBus.emit({
          executionId,
          channelId: this.channelId,
          chatId: this.chatId,
          type,
          timestamp: Date.now(),
          payload: { text }
        });
      }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || `Copilot command exited with code ${result.code ?? "unknown"}.`);
    }

    const response = stripAnsi(result.stdout).trim();

    this.state.turns.push({ role: "user", content: userText });
    this.state.turns.push({ role: "assistant", content: response });
    this.pruneTurns();

    return response;
  }

  async close(): Promise<void> {
    this.state.turns.length = 0;
  }

  private pruneTurns(): void {
    const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;
    const maxEntries = Math.max(0, maxTurns * 2);
    if (this.state.turns.length <= maxEntries) {
      return;
    }

    this.state.turns.splice(0, this.state.turns.length - maxEntries);
  }
}