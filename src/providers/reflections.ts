import {
    embed,
    MemoryManager,
    formatMessages,
    type AgentRuntime as IAgentRuntime,
} from "@elizaos/core";
import type { Memory, Provider, State } from "@elizaos/core";
import { Reflection } from "../types";
import { REFLECTIONS_CACHE_KEY } from "../constants";

const reflectionsProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        if(message?.content?.action != "TWEET" || 
            !runtime.getSetting("TWITTER_USE_DEFAULT_REFLECTIONS")) {
            return "";
        }

        const reflections: Reflection[] | undefined = await runtime.cacheManager.get(REFLECTIONS_CACHE_KEY);
        if(!reflections) {
            return "";
        }

        const filteredReflections = reflections.filter(r => !r.used);
        if(filteredReflections.length == 0) {
            return "";
        }
        
        reflections.forEach(r => {
            r.used = true;
        });
        await runtime.cacheManager.set(REFLECTIONS_CACHE_KEY, reflections);

        return filteredReflections.map(r => r.reflection).join("\n");
    },
};

export { reflectionsProvider };