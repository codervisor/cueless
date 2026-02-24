import assert from "assert";
import test from "node:test";
import { ClaudeSession } from "../src/runtime/session/claudeSession";
import { CommandRunner } from "../src/runtime/session/utils";

test("ClaudeSession first call uses -p and second call resumes with --resume", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  const run: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    if (calls.length === 1) {
      return { code: 0, stderr: "", stdout: "Session ID: claude-123\n\u001b[32mHello\u001b[0m" };
    }
    return { code: 0, stderr: "", stdout: "Hi again" };
  };

  const session = new ClaudeSession("telegram", "chat-1", { name: "claude", command: "claude" }, run);
  const first = await session.send("hello", "exec-1", {} as never);
  await session.send("follow up", "exec-2", {} as never);

  assert.equal(first.includes("\u001b"), false);
  assert.deepEqual(calls[0]?.args, ["-p", "hello"]);
  assert.deepEqual(calls[1]?.args, ["--resume", "claude-123", "-p", "follow up"]);
});

test("ClaudeSession retries as fresh session when resume fails", async () => {
  const calls: Array<string[]> = [];

  const run: CommandRunner = async (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return { code: 0, stderr: "", stdout: "Session ID: claude-xyz\nready" };
    }

    if (calls.length === 2) {
      throw new Error("resume failed");
    }

    return { code: 0, stderr: "", stdout: "fresh response" };
  };

  const session = new ClaudeSession("telegram", "chat-1", { name: "claude", command: "claude" }, run);
  await session.send("first", "exec-1", {} as never);
  const response = await session.send("second", "exec-2", {} as never);

  assert.equal(response, "fresh response");
  assert.deepEqual(calls[1], ["--resume", "claude-xyz", "-p", "second"]);
  assert.deepEqual(calls[2], ["-p", "second"]);
});