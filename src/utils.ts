import type { Tweet } from "agent-twitter-client";
import { getEmbeddingZeroVector, composeContext,  generateText, ModelClass } from "@elizaos/core";
import type { Content, Memory, UUID, IAgentRuntime } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import type { ClientBase } from "./base";
import { elizaLogger } from "@elizaos/core";
import type { Media } from "@elizaos/core";
import fs from "fs";
import path from "path";
import { MediaData } from "./types";

export const wait = (minTime = 1000, maxTime = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export const isValidTweet = (tweet: Tweet): boolean => {
    // Filter out tweets with too many hashtags, @s, or $ signs, probably spam or garbage
    const hashtagCount = (tweet.text?.match(/#/g) || []).length;
    const atCount = (tweet.text?.match(/@/g) || []).length;
    const dollarSignCount = (tweet.text?.match(/\$/g) || []).length;
    const totalCount = hashtagCount + atCount + dollarSignCount;

    return (
        hashtagCount <= 1 &&
        atCount <= 2 &&
        dollarSignCount <= 1 &&
        totalCount <= 3
    );
};

export async function buildConversationThread(
    tweet: Tweet,
    client: ClientBase,
    maxReplies = 10
): Promise<Tweet[]> {
    const thread: Tweet[] = [];
    const visited: Set<string> = new Set();
    const conversationId = stringToUuid(tweet.conversationId + "-" + client.runtime.agentId);
    const existingConversation = await client.runtime.databaseAdapter.getConversation(conversationId);

    async function processThread(currentTweet: Tweet, depth = 0) {
        elizaLogger.debug("Processing tweet:", {
            id: currentTweet.id,
            inReplyToStatusId: currentTweet.inReplyToStatusId,
            depth: depth,
        });

        if (!currentTweet) {
            elizaLogger.debug("No current tweet found for thread building");
            return;
        }

        // Stop if we've reached our reply limit
        if (depth >= maxReplies) {
            elizaLogger.debug("Reached maximum reply depth", depth);
            return;
        }

        // Handle memory storage
        const memory = await client.runtime.messageManager.getMemoryById(
            stringToUuid(currentTweet.id + "-" + client.runtime.agentId)
        );
        if (!memory) {
            const roomId = stringToUuid(
                currentTweet.conversationId + "-" + client.runtime.agentId
            );
            const userId = stringToUuid(currentTweet.userId);

            await client.runtime.ensureConnection(
                userId,
                roomId,
                currentTweet.username,
                currentTweet.name,
                "twitter"
            );

            await client.runtime.messageManager.createMemory({
                id: stringToUuid(
                    currentTweet.id + "-" + client.runtime.agentId
                ),
                agentId: client.runtime.agentId,
                content: {
                    text: currentTweet.text,
                    source: "twitter",
                    url: currentTweet.permanentUrl,
                    imageUrls: currentTweet.photos.map((p) => p.url) || [],
                    inReplyTo: currentTweet.inReplyToStatusId
                        ? stringToUuid(
                              currentTweet.inReplyToStatusId +
                                  "-" +
                                  client.runtime.agentId
                          )
                        : undefined,
                },
                createdAt: currentTweet.timestamp * 1000,
                roomId,
                userId:
                    currentTweet.userId === client.profile.id
                        ? client.runtime.agentId
                        : stringToUuid(currentTweet.userId),
                embedding: getEmbeddingZeroVector(),
            });
        }

        if (visited.has(currentTweet.id)) {
            elizaLogger.debug("Already visited tweet:", currentTweet.id);
            return;
        }

        visited.add(currentTweet.id);
        thread.unshift(currentTweet);

        elizaLogger.debug("Current thread state:", {
            length: thread.length,
            currentDepth: depth,
            tweetId: currentTweet.id,
        });

        // If there's a parent tweet, fetch and process it
        if (currentTweet.inReplyToStatusId) {
            elizaLogger.debug(
                "Fetching parent tweet:",
                currentTweet.inReplyToStatusId
            );
            try {
                const parentTweet = await client.twitterClient.getTweet(
                    currentTweet.inReplyToStatusId
                );

                if (parentTweet) {
                    elizaLogger.debug("Found parent tweet:", {
                        id: parentTweet.id,
                        text: parentTweet.text?.slice(0, 50),
                    });
                    await processThread(parentTweet, depth + 1);
                } else {
                    elizaLogger.debug(
                        "No parent tweet found for:",
                        currentTweet.inReplyToStatusId
                    );
                }
            } catch (error) {
                elizaLogger.error("Error fetching parent tweet:", {
                    tweetId: currentTweet.inReplyToStatusId,
                    error,
                });
            }
        } else {
            elizaLogger.debug(
                "Reached end of reply chain at:",
                currentTweet.id
            );
        }
    }

    await processThread(tweet, 0);
    // After thread is built, store conversation
    const messageIds = thread.map(t =>
        stringToUuid(t.id + "-" + client.runtime.agentId)
    );

    const participantIds = [...new Set(thread.map(t =>
        t.userId === client.profile.id
            ? client.runtime.agentId
            : stringToUuid(t.userId)
    ))];

    // Format conversation for analysis
    const formattedConversation = thread.map(tweet => `@${tweet.username}: ${tweet.text}`)
        .join("\n");

    elizaLogger.debug("Conversation thread built:", {
        messageCount: thread.length,
        participants: thread.map(t => t.username).filter((v, i, a) => a.indexOf(v) === i),
        messageIds: messageIds,
        conversationId: conversationId
    });
    if (existingConversation) {
        // Parse existing JSON arrays
        elizaLogger.debug("Updating existing conversation", {
            id: conversationId,
            newMessageCount: messageIds.length,
            
        });
        const existingMessageIds = JSON.parse(existingConversation.messageIds);
        const existingParticipantIds = JSON.parse(existingConversation.participantIds);
        await client.runtime.databaseAdapter.updateConversation({
            id: conversationId,
            messageIds: JSON.stringify([...new Set([...existingMessageIds, ...messageIds])]),
            participantIds: JSON.stringify([...new Set([...existingParticipantIds, ...participantIds])]),
            lastMessageAt: new Date(Math.max(
                ...thread.map(t => t.timestamp * 1000),
                existingConversation.lastMessageAt.getTime()
            )),
            context: formattedConversation,
            status: 'ACTIVE'
        });
    } else {
        elizaLogger.debug("Creating new conversation", {
            id: conversationId,
            messageCount: messageIds.length,
            participantCount: participantIds.length
        });
        await client.runtime.databaseAdapter.storeConversation({
            id: conversationId,
            rootTweetId: thread[0].id,
            messageIds: JSON.stringify(messageIds),
            participantIds: JSON.stringify(participantIds),
            startedAt: new Date(thread[0].timestamp * 1000),
            lastMessageAt: new Date(thread[thread.length - 1].timestamp * 1000),
            context: formattedConversation,
            agentId: client.runtime.agentId
        });
    }
    elizaLogger.debug("Final thread details:", {
        totalTweets: thread.length,
        tweetIds: thread.map((t) => ({
        tweetDetails: thread.map(t => ({
            id: t.id,
            text: t.text?.slice(0, 50),
        })),
            author: t.username,
            text: t.text?.slice(0, 50) + "..."
        }))
    });

    const conversationMessagess = await client.runtime.databaseAdapter.getConversationMessages(conversationId)
    elizaLogger.debug ("conversation messages", conversationMessagess)

    return thread;
}

export async function fetchMediaData(
    attachments: Media[]
): Promise<MediaData[]> {
    return Promise.all(
        attachments.map(async (attachment: Media) => {
            if (/^(http|https):\/\//.test(attachment.url)) {
                // Handle HTTP URLs
                const response = await fetch(attachment.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${attachment.url}`);
                }
                const mediaBuffer = Buffer.from(await response.arrayBuffer());
                const mediaType = attachment.contentType;
                return { data: mediaBuffer, mediaType };
            } else if (fs.existsSync(attachment.url)) {
                // Handle local file paths
                const mediaBuffer = await fs.promises.readFile(
                    path.resolve(attachment.url)
                );
                const mediaType = attachment.contentType;
                return { data: mediaBuffer, mediaType };
            } else {
                throw new Error(
                    `File not found: ${attachment.url}. Make sure the path is correct.`
                );
            }
        })
    );
}

export async function sendTweet(
    client: ClientBase,
    content: Content,
    roomId: UUID,
    twitterUsername: string,
    inReplyTo: string
): Promise<Memory[]> {
    const maxTweetLength = client.twitterConfig.MAX_TWEET_LENGTH;
    const isLongTweet = maxTweetLength > 280;

    const tweetChunks = splitTweetContent(content.text, maxTweetLength);
    const sentTweets: Tweet[] = [];
    let previousTweetId = inReplyTo;

    for (const chunk of tweetChunks) {
        let mediaData = null;

        if (content.attachments && content.attachments.length > 0) {
            mediaData = await fetchMediaData(content.attachments);
        }

        const cleanChunk = deduplicateMentions(chunk.trim())

        const result = await client.requestQueue.add(async () =>
            isLongTweet
                ? client.twitterClient.sendLongTweet(
                      cleanChunk,
                      previousTweetId,
                      mediaData
                  )
                : client.twitterClient.sendTweet(
                      cleanChunk,
                      previousTweetId,
                      mediaData
                  )
        );

        const body = await result.json();
        const tweetResult = isLongTweet
            ? body?.data?.notetweet_create?.tweet_results?.result
            : body?.data?.create_tweet?.tweet_results?.result;

        // if we have a response
        if (tweetResult) {
            // Parse the response
            const finalTweet: Tweet = {
                id: tweetResult.rest_id,
                text: tweetResult.legacy.full_text,
                conversationId: tweetResult.legacy.conversation_id_str,
                timestamp:
                    new Date(tweetResult.legacy.created_at).getTime() / 1000,
                userId: tweetResult.legacy.user_id_str,
                inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
                permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
                hashtags: [],
                mentions: [],
                photos: [],
                thread: [],
                urls: [],
                videos: [],
            };
            sentTweets.push(finalTweet);
            previousTweetId = finalTweet.id;
        } else {
            elizaLogger.error("Error sending tweet chunk:", {
                chunk,
                response: body,
            });
        }

        // Wait a bit between tweets to avoid rate limiting issues
        await wait(1000, 2000);
    }

    const memories: Memory[] = sentTweets.map((tweet) => ({
        id: stringToUuid(tweet.id + "-" + client.runtime.agentId),
        agentId: client.runtime.agentId,
        userId: client.runtime.agentId,
        content: {
            tweetId: tweet.id,
            text: tweet.text,
            source: "twitter",
            url: tweet.permanentUrl,
            imageUrls: tweet.photos.map((p) => p.url) || [],
            inReplyTo: tweet.inReplyToStatusId
                ? stringToUuid(
                      tweet.inReplyToStatusId + "-" + client.runtime.agentId
                  )
                : undefined,
        },
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1000, 
    }));

    return memories;
}

function splitTweetContent(content: string, maxLength: number): string[] {
    const paragraphs = content.split("\n\n").map((p) => p.trim());
    const tweets: string[] = [];
    let currentTweet = "";

    for (const paragraph of paragraphs) {
        if (!paragraph) continue;

        if ((currentTweet + "\n\n" + paragraph).trim().length <= maxLength) {
            if (currentTweet) {
                currentTweet += "\n\n" + paragraph;
            } else {
                currentTweet = paragraph;
            }
        } else {
            if (currentTweet) {
                tweets.push(currentTweet.trim());
            }
            if (paragraph.length <= maxLength) {
                currentTweet = paragraph;
            } else {
                // Split long paragraph into smaller chunks
                const chunks = splitParagraph(paragraph, maxLength);
                tweets.push(...chunks.slice(0, -1));
                currentTweet = chunks[chunks.length - 1];
            }
        }
    }

    if (currentTweet) {
        tweets.push(currentTweet.trim());
    }

    return tweets;
}

function extractUrls(paragraph: string): {
    textWithPlaceholders: string;
    placeholderMap: Map<string, string>;
} {
    // replace https urls with placeholder
    const urlRegex = /https?:\/\/[^\s]+/g;
    const placeholderMap = new Map<string, string>();

    let urlIndex = 0;
    const textWithPlaceholders = paragraph.replace(urlRegex, (match) => {
        // twitter url would be considered as 23 characters
        // <<URL_CONSIDERER_23_1>> is also 23 characters
        const placeholder = `<<URL_CONSIDERER_23_${urlIndex}>>`; // Placeholder without . ? ! etc
        placeholderMap.set(placeholder, match);
        urlIndex++;
        return placeholder;
    });

    return { textWithPlaceholders, placeholderMap };
}

function splitSentencesAndWords(text: string, maxLength: number): string[] {
    // Split by periods, question marks and exclamation marks
    // Note that URLs in text have been replaced with `<<URL_xxx>>` and won't be split by dots
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= maxLength) {
            if (currentChunk) {
                currentChunk += " " + sentence;
            } else {
                currentChunk = sentence;
            }
        } else {
            // Can't fit more, push currentChunk to results
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }

            // If current sentence itself is less than or equal to maxLength
            if (sentence.length <= maxLength) {
                currentChunk = sentence;
            } else {
                // Need to split sentence by spaces
                const words = sentence.split(" ");
                currentChunk = "";
                for (const word of words) {
                    if (
                        (currentChunk + " " + word).trim().length <= maxLength
                    ) {
                        if (currentChunk) {
                            currentChunk += " " + word;
                        } else {
                            currentChunk = word;
                        }
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                        }
                        currentChunk = word;
                    }
                }
            }
        }
    }

    // Handle remaining content
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

function deduplicateMentions(paragraph: string) {
    // Regex to match mentions at the beginning of the string
  const mentionRegex = /^@(\w+)(?:\s+@(\w+))*(\s+|$)/;

  // Find all matches
  const matches = paragraph.match(mentionRegex);

  if (!matches) {
    return paragraph; // If no matches, return the original string
  }

  // Extract mentions from the match groups
  let mentions = matches.slice(0, 1)[0].trim().split(' ')

  // Deduplicate mentions
  mentions = [...new Set(mentions)];

  // Reconstruct the string with deduplicated mentions
  const uniqueMentionsString = mentions.join(' ');

  // Find where the mentions end in the original string
  const endOfMentions = paragraph.indexOf(matches[0]) + matches[0].length;

  // Construct the result by combining unique mentions with the rest of the string
  return uniqueMentionsString + ' ' + paragraph.slice(endOfMentions);
}

function restoreUrls(
    chunks: string[],
    placeholderMap: Map<string, string>
): string[] {
    return chunks.map((chunk) => {
        // Replace all <<URL_CONSIDERER_23_>> in chunk back to original URLs using regex
        return chunk.replace(/<<URL_CONSIDERER_23_(\d+)>>/g, (match) => {
            const original = placeholderMap.get(match);
            return original || match; // Return placeholder if not found (theoretically won't happen)
        });
    });
}

function splitParagraph(paragraph: string, maxLength: number): string[] {
    // 1) Extract URLs and replace with placeholders
    const { textWithPlaceholders, placeholderMap } = extractUrls(paragraph);

    // 2) Use first section's logic to split by sentences first, then do secondary split
    const splittedChunks = splitSentencesAndWords(
        textWithPlaceholders,
        maxLength
    );

    // 3) Replace placeholders back to original URLs
    const restoredChunks = restoreUrls(splittedChunks, placeholderMap);

    return restoredChunks;
}
export async function analyzeConversation(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<void> {
    
    const conversation = await runtime.databaseAdapter.getConversation(conversationId);
    console.debug("analyze conversation", conversation)
    if (!conversation) {
        elizaLogger.error("No conversation found for analysis", conversationId);
        return;
    }

    // Get all messages in order
    const messages = await runtime.databaseAdapter.getConversationMessages(conversationId);
    if (messages.length === 0) {
        elizaLogger.error("No messages found in conversation for analysis", conversationId);
        return;
    }
// Get the last message to use for state building
    const lastMessage = messages[messages.length - 1];
    // Build state with conversation context
    const state = await runtime.composeState(lastMessage, {
        conversationId: conversationId,
        twitterUserName: runtime.getSetting("TWITTER_USERNAME")
    });

    //console.log("state:", state)

    // Format conversation for per-user analysis
    const analysisTemplate = ` 
    #Conversation:
    {{recentUserConversations}}

    #Instructions:
    Evaluate the messages the other users sent to you in this conversation. 
    Rate each users messages sent to you as a whole using these metrics: [-5] very bad, [0] neutral, [5] very good. 
    Evaluates these messages as the character {{agentName}} (@{{twitterUserName}}):with the context of the whole conversation. 
    If you aren't sure if the message was directed to you, or you're missing context to give a good answer, give the score [0] neutral. 

    Return ONLY a JSON object with usernames as keys and scores as values. Example format:
    {
        "@user1": 0.8,
        "@user2": -0.3
    }`;
    const context = composeContext({
        state,
        template: analysisTemplate
    });

    const analysis = await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    elizaLogger.log("User sentiment scores:", analysis);

    try {
        const sentimentScores = JSON.parse(analysis);
        // Update conversation with analysis
        await runtime.databaseAdapter.updateConversation({
            id: conversationId,
            status: 'CLOSED'
        });
        // Update user rapport based on sentiment scores
        for (const [username, score] of Object.entries(sentimentScores)) {
            await runtime.databaseAdapter.setUserRapport(
                username,
                runtime.agentId,
                score as number
            );
        }
    } catch (error) {
        elizaLogger.error("Error parsing sentiment analysis:", error);
    }
}

export async function isConversationDone(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<boolean> {
    const conversation = await runtime.databaseAdapter.getConversation(conversationId);
    const lastMessageTime = new Date(conversation.lastMessageAt);
    const now = new Date();

    const timeInactive = now.getTime() - lastMessageTime.getTime();
    if (timeInactive > 45 * 60 * 1000) {
       
        return true;
    }

    return false;
}

export async function closeConversation(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<void> {
    await runtime.databaseAdapter.updateConversation({
        id: conversationId,
        status: 'CLOSED',
        closedAt: new Date()
    });

    await analyzeConversation(conversationId, runtime);
}

export async function checkAndCloseConversation(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<void> {
    if (await isConversationDone(conversationId, runtime)) {
        elizaLogger.log("Closing conversation:", conversationId);
        await closeConversation(conversationId, runtime);
    }
}