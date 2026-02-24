import { AgentConfig, Config } from "../config";
import { AgentRegistry } from "../hub/agentRegistry";
import { Logger } from "../logging";
import { CliRuntime } from "./cliRuntime";
import { Runtime } from "./types";

export const createRuntime = (agent: AgentConfig, logger: Logger): Runtime => {
  return new CliRuntime(agent, logger);
};

export const createAgentRegistry = (config: Config, logger: Logger): AgentRegistry => {
  const registry = new AgentRegistry(config.defaultAgent);

  for (const agent of config.agents) {
    registry.register(agent.name, createRuntime(agent, logger));
  }

  return registry;
};
