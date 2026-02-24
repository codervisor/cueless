import assert from "assert";
import { EventBus } from "../src/events/eventBus";
import { Gateway } from "../src/gateway/gateway";
import { createLogger } from "../src/logging";
import { MockAdapter } from "./mockAdapter";
import { MockRuntime } from "./mockRuntime";

const run = async () => {
  const logger = createLogger("error");
  const adapter = new MockAdapter();
  const runtime = new MockRuntime();
  const eventBus = new EventBus();
  const gateway = new Gateway(adapter, runtime, eventBus, logger);

  await gateway.start();

  await adapter.simulateIncoming({
    channelId: "mock",
    chatId: "test-chat",
    userId: "user-1",
    text: "deploy staging"
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(adapter.sentMessages.length >= 2, "Expected messages to be sent.");
  assert.ok(
    adapter.sentMessages.some((msg) => msg.text.includes("Execution complete")),
    "Expected completion message."
  );

  await gateway.stop();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
