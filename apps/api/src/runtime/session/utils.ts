import { spawn } from "child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }
) => Promise<CommandResult>;

export const stripAnsi = (text: string): string => {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
};

const SESSION_PATTERNS = [
  /session\s*id\s*[:=]\s*([a-zA-Z0-9._-]+)/i,
  /chat\s*id\s*[:=]\s*([a-zA-Z0-9._-]+)/i,
  /--resume\s+([a-zA-Z0-9._-]+)/i,
  /--chat-id\s+([a-zA-Z0-9._-]+)/i
];

export const parseNativeId = (output: string): string | undefined => {
  for (const pattern of SESSION_PATTERNS) {
    const match = output.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
};

export const spawnAndCollect: CommandRunner = async (command, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      shell: true,
      env: {
        ...process.env,
        ...(options?.env || {})
      }
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Runtime timeout."));
    }, options?.timeoutMs ?? 10 * 60 * 1000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });
  });
};