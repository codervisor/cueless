import assert from "assert";
import test from "node:test";
import { spawnAndCollect, spawnAndStream } from "../src/runtime/session/utils";

test("spawnAndStream forwards stdout and stderr chunks", async () => {
  const chunks: Array<{ type: "stdout" | "stderr"; text: string }> = [];
  const script = "process.stdout.write('hello'); process.stderr.write('warn'); process.stdout.write(' world')";

  const result = await spawnAndStream(
    `node -e \"${script}\"`,
    [],
    { timeoutMs: 2_000 },
    (type, text) => {
      chunks.push({ type, text });
    }
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "hello world");
  assert.equal(result.stderr, "warn");
  assert.ok(chunks.some((chunk) => chunk.type === "stdout"));
  assert.ok(chunks.some((chunk) => chunk.type === "stderr"));
});

test("spawnAndStream returns aggregated output when callback omitted", async () => {
  const script = "process.stdout.write('abc'); process.stderr.write('def')";

  const streamed = await spawnAndStream(
    `node -e \"${script}\"`,
    [],
    { timeoutMs: 2_000 }
  );

  const collected = await spawnAndCollect(
    `node -e \"${script}\"`,
    [],
    { timeoutMs: 2_000 }
  );

  assert.equal(streamed.code, 0);
  assert.deepEqual(streamed, collected);
});
