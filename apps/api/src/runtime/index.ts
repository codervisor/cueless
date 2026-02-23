import { Config } from "../config";
import { Logger } from "../logging";
import { CliRuntime } from "./cliRuntime";
import { Runtime } from "./types";

export const createRuntime = (config: Config, logger: Logger): Runtime => {
  return new CliRuntime(config, logger);
};
