import { Config } from "../config";
import { Logger } from "../logging";
import { CliRuntime } from "./cliRuntime";
import { MockRuntime } from "./mockRuntime";
import { Runtime } from "./types";

export const createRuntime = (config: Config, logger: Logger): Runtime => {
  if (config.runtimeType === "cli") {
    return new CliRuntime(config, logger);
  }
  return new MockRuntime();
};
