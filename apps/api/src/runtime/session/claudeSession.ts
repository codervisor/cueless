import { randomUUID } from "crypto";
import { AgentConfig } from "../../config";
import { EventBus } from "../../events/eventBus";
import { NativeSessionState, AgentSession } from "./types";
import { CommandRunner, parseNativeId, spawnAndCollect, stripAnsi } from "./utils";

export class ClaudeSession implements AgentSession {
  readonly sessionId = randomUUID();
  private state: NativeSessionState | undefined;

  constructor(
    readonly channelId: string,
    readonly chatId: string,
    private readonly config: AgentConfig,
    private readonly run: CommandRunner = spawnAndCollect
  ) { }

  async send(userText: string, _executionId: string, _eventBus: EventBus): Promise<string> {
    try {
      return await this.execute(userText, this.state?.nativeSessionId);
    } catch {
      if (!this.state) {
        throw new Error("Failed to start Claude session.");
      }

      this.state = undefined;
      return this.execute(userText, undefined);
    }
  }

  async close(): Promise<void> {
    this.state = undefined;
  }

  private async execute(userText: string, resumeId?: string): Promise<string> {
    const args = [
      ...(this.config.args || []),
      ...(resumeId ? ["--resume", resumeId] : []),
      "-p",
      userText
    ];

    const result = await this.run(this.config.command, args, {
      cwd: this.config.workingDir,
      env: this.config.env,
      timeoutMs: this.config.timeoutMs
    });

    if (result.code !== 0) {
      throw new Error(result.stderr || `Claude command exited with code ${result.code ?? "unknown"}.`);
    }

    const cleaned = stripAnsi(result.stdout).trim();

    if (!resumeId) {
      const nativeSessionId = parseNativeId(cleaned);
      if (nativeSessionId) {
        this.state = { strategy: "native", nativeSessionId };
      }
    }

    return cleaned;
  }
}