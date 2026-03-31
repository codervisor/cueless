import assert from "assert";
import test from "node:test";
import { defaultWorkingDir, loadConfig } from "../src/config";

/**
 * Helper: run loadConfig with the given env vars, restoring originals afterward.
 */
const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    originals[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
};

test("loadConfig returns empty channels when TELEGRAM_BOT_TOKEN is unset", () => {
  withEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHANNEL_ID: undefined }, () => {
    const config = loadConfig();
    assert.deepStrictEqual(config.channels, []);
  });
});

test("loadConfig defaults channel id to 'telegram' when TELEGRAM_CHANNEL_ID is unset", () => {
  withEnv({ TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHANNEL_ID: undefined }, () => {
    const config = loadConfig();
    assert.equal(config.channels.length, 1);
    assert.equal(config.channels[0].id, "telegram");
  });
});

test("loadConfig defaults channel id to 'telegram' when TELEGRAM_CHANNEL_ID is whitespace-only", () => {
  withEnv({ TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHANNEL_ID: "  " }, () => {
    const config = loadConfig();
    assert.equal(config.channels[0].id, "telegram");
  });
});

test("loadConfig uses custom TELEGRAM_CHANNEL_ID when provided", () => {
  withEnv({ TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHANNEL_ID: "my-bot" }, () => {
    const config = loadConfig();
    assert.equal(config.channels[0].id, "my-bot");
  });
});

test("loadConfig trims whitespace from TELEGRAM_CHANNEL_ID", () => {
  withEnv({ TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHANNEL_ID: "  my-bot  " }, () => {
    const config = loadConfig();
    assert.equal(config.channels[0].id, "my-bot");
  });
});

test("defaultWorkingDir returns /data when directory exists", () => {
  assert.equal(defaultWorkingDir(() => true), "/data");
});

test("defaultWorkingDir returns undefined when directory does not exist", () => {
  assert.equal(defaultWorkingDir(() => false), undefined);
});
