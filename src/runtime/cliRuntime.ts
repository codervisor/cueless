import { spawn } from "child_process";
import { Config } from "../config";
import { EventBus } from "../events/eventBus";
import { IMMessage } from "../gateway/types";
import { Logger } from "../logging";
import { Runtime } from "./types";

export class CliRuntime implements Runtime {
  constructor(private readonly config: Config, private readonly logger: Logger) { }

  async execute(message: IMMessage, executionId: string, eventBus: EventBus): Promise<void> {
    if (!this.config.runtimeCommand) {
      throw new Error("RUNTIME_COMMAND is required for cli runtime.");
    }

    eventBus.emit({
      executionId,
      chatId: message.chatId,
      type: "start",
      timestamp: Date.now()
    });

    return new Promise((resolve, reject) => {
      const child = spawn(this.config.runtimeCommand as string, {
        cwd: this.config.runtimeWorkingDir,
        shell: true,
        env: process.env
      });

      const timeout: NodeJS.Timeout = setTimeout(() => {
        child.kill("SIGKILL");
        eventBus.emit({
          executionId,
          chatId: message.chatId,
          type: "error",
          timestamp: Date.now(),
          payload: { reason: "Runtime timeout." }
        });
        reject(new Error("Runtime timeout."));
      }, this.config.runtimeTimeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        eventBus.emit({
          executionId,
          chatId: message.chatId,
          type: "stdout",
          timestamp: Date.now(),
          payload: { text: chunk.toString() }
        });
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        eventBus.emit({
          executionId,
          chatId: message.chatId,
          type: "stderr",
          timestamp: Date.now(),
          payload: { text: chunk.toString() }
        });
      });

      child.on("error", (error: Error) => {
        clearTimeout(timeout);
        eventBus.emit({
          executionId,
          chatId: message.chatId,
          type: "error",
          timestamp: Date.now(),
          payload: { reason: error.message }
        });
        reject(error);
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timeout);
        eventBus.emit({
          executionId,
          chatId: message.chatId,
          type: "complete",
          timestamp: Date.now(),
          payload: { code: code ?? null }
        });
        resolve();
      });

      if (child.stdin) {
        child.stdin.write(message.text);
        child.stdin.write("\n");
        child.stdin.end();
      }

      this.logger.info("Spawned CLI runtime.", { executionId, command: this.config.runtimeCommand });
    });
  }
}
