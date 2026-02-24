import assert from "assert";
import test from "node:test";
import { buildPrompt, CopilotSession } from "../src/runtime/session/copilotSession";
import { CommandRunner } from "../src/runtime/session/utils";

test("CopilotSession first call has no history and second includes transcript", async () => {
  const calls: string[][] = [];

  const run: CommandRunner = async (_command, args) => {
    calls.push(args);
    return {
      code: 0,
      stderr: "",
      stdout: calls.length === 1 ? "\u001b[32mfirst answer\u001b[0m" : "second answer"
    };
  };

  const session = new CopilotSession("telegram", "chat-1", { name: "copilot", command: "copilot" }, run);
  const first = await session.send("how to list files", "exec-1", {} as never);
  await session.send("and count them", "exec-2", {} as never);

  assert.equal(first, "first answer");
  assert.equal(calls[0]?.[0], "-p");
  assert.equal(calls[0]?.[1], "how to list files");
  assert.ok(calls[1]?.[1].includes("Previous conversation:"));
  assert.ok(calls[1]?.[1].includes("User: how to list files"));
  assert.ok(calls[1]?.[1].includes("Assistant: first answer"));
});

test("CopilotSession prunes transcript based on maxTurns", async () => {
  const prompts: string[] = [];

  const run: CommandRunner = async (_command, args) => {
    prompts.push(args[1] ?? "");
    return { code: 0, stderr: "", stdout: `answer-${prompts.length}` };
  };

  const session = new CopilotSession("telegram", "chat-1", {
    name: "copilot",
    command: "copilot",
    maxTurns: 1
  }, run);

  await session.send("first", "exec-1", {} as never);
  await session.send("second", "exec-2", {} as never);
  await session.send("third", "exec-3", {} as never);

  assert.ok(prompts[2]?.includes("User: second"));
  assert.equal(prompts[2]?.includes("User: first"), false);
});

test("buildPrompt returns raw user text when no turns", () => {
  assert.equal(buildPrompt([], "hello"), "hello");
});