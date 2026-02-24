import assert from "assert";
import test from "node:test";
import { GeminiSession } from "../src/runtime/session/geminiSession";
import { CommandRunner } from "../src/runtime/session/utils";

test("GeminiSession uses --chat-id on subsequent turns", async () => {
  const calls: string[][] = [];

  const run: CommandRunner = async (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return { code: 0, stderr: "", stdout: "chat id: gem-42\n\u001b[33mhello\u001b[0m" };
    }
    return { code: 0, stderr: "", stdout: "response 2" };
  };

  const session = new GeminiSession("telegram", "chat-1", { name: "gemini", command: "gemini" }, run);
  const first = await session.send("hello", "exec-1", {} as never);
  await session.send("again", "exec-2", {} as never);

  assert.equal(first.includes("\u001b"), false);
  assert.deepEqual(calls[0], ["-p", "hello"]);
  assert.deepEqual(calls[1], ["--chat-id", "gem-42", "-p", "again"]);
});

test("GeminiSession retries without --chat-id when resume fails", async () => {
  const calls: string[][] = [];

  const run: CommandRunner = async (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return { code: 0, stderr: "", stdout: "chat id: gem-77" };
    }

    if (calls.length === 2) {
      throw new Error("chat-id expired");
    }

    return { code: 0, stderr: "", stdout: "fresh session" };
  };

  const session = new GeminiSession("telegram", "chat-1", { name: "gemini", command: "gemini" }, run);
  await session.send("first", "exec-1", {} as never);
  const response = await session.send("second", "exec-2", {} as never);

  assert.equal(response, "fresh session");
  assert.deepEqual(calls[1], ["--chat-id", "gem-77", "-p", "second"]);
  assert.deepEqual(calls[2], ["-p", "second"]);
});