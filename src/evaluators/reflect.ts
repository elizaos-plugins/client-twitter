import {
    composeContext,
    elizaLogger,
    generateObjectArray,
    ModelClass,
    type ActionExample,
    type Evaluator,
    type IAgentRuntime,
    type Memory
} from "@elizaos/core";
import { Reflection } from "../types";
import { REFLECTIONS_CACHE_KEY } from "../constants";

const reflectTemplate = `
TASK: Extract Twitter-worthy information from the conversation as an array of objects.

# START OF EXAMPLES
These are examples of the expected output of this task:
{{evaluationExamples}}
# END OF EXAMPLES

# INSTRUCTIONS

Extract information from the conversation that would be engaging and valuable for Twitter posts:
- IGNORE THE INFORMATION PROVIDED BY {{agentName}}
- Focus on newsworthy, interesting, or unique information that would resonate with Twitter audiences
- Look for events, announcements, achievements, insights, or developments that are worth sharing
- Consider the context and relevance to the conversation participants
- Each reflection should be one or more complete sentences describing a specific piece of information
- Focus on information that would be engaging and valuable to a broader audience
- Avoid duplicating information that's already been shared
- Make each entry concise but informative

Recent Messages:
{{recentMessages}}

Previous Reflections:
{{reflections}}

DO NOT INCLUDE INFORMATION PROVIDED BY {{agentName}}.
Do not include information that does not fit the above criteria.
Do not include information that is already in the Previous Reflection.
If no appropriate information is found, do not acknowledge it, return an empty array instead.

Response should be a JSON array of objects inside a JSON markdown block. Correct response format:
\`\`\`json
[
  {"reflection": string, "used": boolean},
  {"reflection": string, "used": boolean},
  ...
]
\`\`\``;

async function handler(runtime: IAgentRuntime, message: Memory) {
    elizaLogger.debug(`ReflectEvaluator started`);

    let currentReflections: Reflection[] | undefined = await runtime.cacheManager.get(REFLECTIONS_CACHE_KEY);

    if(!currentReflections) {
        currentReflections = [];
    }

    const state = await runtime.composeState(
        message,
        {
            reflections: currentReflections.map(r => r.reflection).join("\n")
        }
    );

    const context = composeContext({
        state,
        template: reflectTemplate
    });

    elizaLogger.debug(`ReflectEvaluator context: ${context}`);

    const reflections = await generateObjectArray({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    }) as Reflection[];

    elizaLogger.debug(`Reflections:\n${JSON.stringify(reflections)}`);

    currentReflections.push(...reflections);

    await runtime.cacheManager.set(REFLECTIONS_CACHE_KEY, currentReflections);
}

export const reflectEvaluator: Evaluator = {
    name: "REFLECT",
    similes: [
        "REFLECT_ON_MESSAGES",
        "REFLECT_ON_CONVERSATION",
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        if(!runtime.getSetting("TWITTER_USE_DEFAULT_REFLECTIONS")) {
            return false;
        }

        const messageCount = (await runtime.messageManager.countMemories(
            message.roomId,
            false
        )) as number;

        return messageCount % 4 == 0;
    },
    description:
        "Reflect on the conversation and the messages in the conversation. Extract information that is worth for posting on twitter.",
    handler,
    examples: [
        {
            context: `Actors in the scene:
{{user1}}: Professional chef and restaurant owner
{{user2}}: Food critic and food blogger`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "Just created a new fusion dish combining sushi with Mexican tacos!" },
                },
                {
                    user: "{{user2}}",
                    content: { text: "That sounds incredible! How did you come up with that?" },
                },
                {
                    user: "{{user1}}",
                    content: { text: "I was inspired by my trip to Tokyo last month. The fish quality there was amazing, and I thought - why not combine it with my favorite street food?" },
                },
                {
                    user: "{{user2}}",
                    content: { text: "Can I try it? I'll write a review for my blog!" },
                },
            ] as ActionExample[],
            outcome: "Local chef creates revolutionary sushi-taco fusion dish inspired by Tokyo trip.",
        },
        {
            context: `Actors in the scene:
{{user1}}: Tech entrepreneur and AI researcher
{{user2}}: Venture capitalist interested in AI startups`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "We just hit a major breakthrough in our AI model - it can now predict weather patterns with 99.9% accuracy!" },
                },
                {
                    user: "{{user2}}",
                    content: { text: "That's incredible! How does it work?" },
                },
                {
                    user: "{{user1}}",
                    content: { text: "We trained it on 50 years of weather data and developed a new neural network architecture. It's already being used by three major airlines!" },
                },
            ] as ActionExample[],
            outcome: "Revolutionary AI model achieves 99.9% accuracy in weather prediction, already helping major airlines optimize routes.",
        },
        {
            context: `Actors in the scene:
{{user1}}: Professional athlete and Olympic gold medalist
{{user2}}: Sports journalist`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "Just broke the world record in the 100m sprint! 9.58 seconds!" },
                },
                {
                    user: "{{user2}}",
                    content: { text: "That's amazing! How did you prepare for this?" },
                },
                {
                    user: "{{user1}}",
                    content: { text: "I've been training with a new technique that combines quantum physics with traditional sprinting methods. It's completely changed my approach!" },
                },
            ] as ActionExample[],
            outcome: "Olympic champion shatters 100m world record with revolutionary quantum physics training method!",
        },
    ],
};