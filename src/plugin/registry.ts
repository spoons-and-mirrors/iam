import { log, LOG } from '../logger';
import type { OpenCodeSessionClient, ConfigTransformOutput } from '../types';
import { createBroadcastTool, createSubagentTool, createRecallTool } from '../tools/index';
import { isBroadcastEnabled, isSubagentEnabled, isRecallEnabled } from '../config';

export function createRegistry(client: OpenCodeSessionClient) {
  return {
    tool: {
      // Only register broadcast tool if enabled in config
      ...(isBroadcastEnabled() ? { broadcast: createBroadcastTool(client) } : {}),
      // Only register recall tool if enabled in config
      ...(isRecallEnabled() ? { recall: createRecallTool() } : {}),
      // Only register subagent tool if enabled in config
      ...(isSubagentEnabled() ? { subagent: createSubagentTool(client) } : {}),
    },

    // Add broadcast, recall, and subagent to subagent_tools (based on config)
    'experimental.config.transform': async (_input: unknown, output: ConfigTransformOutput) => {
      const experimental = output.experimental ?? {};
      const existingSubagentTools = experimental.subagent_tools ?? [];
      const toolsToAdd = [
        ...(isBroadcastEnabled() ? ['broadcast'] : []),
        ...(isRecallEnabled() ? ['recall'] : []),
        ...(isSubagentEnabled() ? ['subagent'] : []),
      ];
      output.experimental = {
        ...experimental,
        subagent_tools: [...existingSubagentTools, ...toolsToAdd],
      };
      log.info(LOG.HOOK, `Added tools to experimental.subagent_tools`, {
        tools: toolsToAdd,
      });
    },
  };
}
