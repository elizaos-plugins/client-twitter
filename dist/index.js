// src/client.ts
import { elizaLogger as elizaLogger8 } from "@elizaos/core";

// src/base.ts
import {
  getEmbeddingZeroVector,
  elizaLogger,
  stringToUuid,
  ActionTimelineType
} from "@elizaos/core";
import {
  Scraper,
  SearchMode
} from "agent-twitter-client";
import { EventEmitter } from "events";
var RequestQueue = class {
  queue = [];
  processing = false;
  async add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      try {
        await request();
      } catch (error) {
        console.error("Error processing request:", error);
        this.queue.unshift(request);
        await this.exponentialBackoff(this.queue.length);
      }
      await this.randomDelay();
    }
    this.processing = false;
  }
  async exponentialBackoff(retryCount) {
    const delay = Math.pow(2, retryCount) * 1e3;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  async randomDelay() {
    const delay = Math.floor(Math.random() * 2e3) + 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
};
var ClientBase = class _ClientBase extends EventEmitter {
  static _twitterClients = {};
  twitterClient;
  runtime;
  twitterConfig;
  directions;
  lastCheckedTweetId = null;
  imageDescriptionService;
  temperature = 0.5;
  requestQueue = new RequestQueue();
  profile;
  async cacheTweet(tweet) {
    if (!tweet) {
      console.warn("Tweet is undefined, skipping cache");
      return;
    }
    this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
  }
  async getCachedTweet(tweetId) {
    const cached = await this.runtime.cacheManager.get(
      `twitter/tweets/${tweetId}`
    );
    return cached;
  }
  async getTweet(tweetId) {
    const cachedTweet = await this.getCachedTweet(tweetId);
    if (cachedTweet) {
      return cachedTweet;
    }
    const tweet = await this.requestQueue.add(
      () => this.twitterClient.getTweet(tweetId)
    );
    await this.cacheTweet(tweet);
    return tweet;
  }
  callback = null;
  onReady() {
    throw new Error(
      "Not implemented in base class, please call from subclass"
    );
  }
  /**
   * Parse the raw tweet data into a standardized Tweet object.
   */
  parseTweet(raw, depth = 0, maxDepth = 3) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y;
    const canRecurse = depth < maxDepth;
    const quotedStatus = ((_a = raw.quoted_status_result) == null ? void 0 : _a.result) && canRecurse ? this.parseTweet(raw.quoted_status_result.result, depth + 1, maxDepth) : void 0;
    const retweetedStatus = ((_b = raw.retweeted_status_result) == null ? void 0 : _b.result) && canRecurse ? this.parseTweet(raw.retweeted_status_result.result, depth + 1, maxDepth) : void 0;
    const t = {
      bookmarkCount: raw.bookmarkCount ?? ((_c = raw.legacy) == null ? void 0 : _c.bookmark_count) ?? void 0,
      conversationId: raw.conversationId ?? ((_d = raw.legacy) == null ? void 0 : _d.conversation_id_str),
      hashtags: raw.hashtags ?? ((_f = (_e = raw.legacy) == null ? void 0 : _e.entities) == null ? void 0 : _f.hashtags) ?? [],
      html: raw.html,
      id: raw.id ?? raw.rest_id ?? raw.id_str ?? void 0,
      inReplyToStatus: raw.inReplyToStatus,
      inReplyToStatusId: raw.inReplyToStatusId ?? ((_g = raw.legacy) == null ? void 0 : _g.in_reply_to_status_id_str) ?? void 0,
      isQuoted: ((_h = raw.legacy) == null ? void 0 : _h.is_quote_status) === true,
      isPin: raw.isPin,
      isReply: raw.isReply,
      isRetweet: ((_i = raw.legacy) == null ? void 0 : _i.retweeted) === true,
      isSelfThread: raw.isSelfThread,
      language: (_j = raw.legacy) == null ? void 0 : _j.lang,
      likes: ((_k = raw.legacy) == null ? void 0 : _k.favorite_count) ?? 0,
      name: raw.name ?? ((_n = (_m = (_l = raw == null ? void 0 : raw.user_results) == null ? void 0 : _l.result) == null ? void 0 : _m.legacy) == null ? void 0 : _n.name) ?? ((_r = (_q = (_p = (_o = raw.core) == null ? void 0 : _o.user_results) == null ? void 0 : _p.result) == null ? void 0 : _q.legacy) == null ? void 0 : _r.name),
      mentions: raw.mentions ?? ((_t = (_s = raw.legacy) == null ? void 0 : _s.entities) == null ? void 0 : _t.user_mentions) ?? [],
      permanentUrl: raw.permanentUrl ?? (((_x = (_w = (_v = (_u = raw.core) == null ? void 0 : _u.user_results) == null ? void 0 : _v.result) == null ? void 0 : _w.legacy) == null ? void 0 : _x.screen_name) && raw.rest_id ? `https://x.com/${(_B = (_A = (_z = (_y = raw.core) == null ? void 0 : _y.user_results) == null ? void 0 : _z.result) == null ? void 0 : _A.legacy) == null ? void 0 : _B.screen_name}/status/${raw.rest_id}` : void 0),
      photos: raw.photos ?? (((_E = (_D = (_C = raw.legacy) == null ? void 0 : _C.entities) == null ? void 0 : _D.media) == null ? void 0 : _E.filter((media) => media.type === "photo").map((media) => ({
        id: media.id_str,
        url: media.media_url_https,
        alt_text: media.alt_text
      }))) || []),
      place: raw.place,
      poll: raw.poll ?? null,
      quotedStatus,
      quotedStatusId: raw.quotedStatusId ?? ((_F = raw.legacy) == null ? void 0 : _F.quoted_status_id_str) ?? void 0,
      quotes: ((_G = raw.legacy) == null ? void 0 : _G.quote_count) ?? 0,
      replies: ((_H = raw.legacy) == null ? void 0 : _H.reply_count) ?? 0,
      retweets: ((_I = raw.legacy) == null ? void 0 : _I.retweet_count) ?? 0,
      retweetedStatus,
      retweetedStatusId: ((_J = raw.legacy) == null ? void 0 : _J.retweeted_status_id_str) ?? void 0,
      text: raw.text ?? ((_K = raw.legacy) == null ? void 0 : _K.full_text) ?? void 0,
      thread: raw.thread || [],
      timeParsed: raw.timeParsed ? new Date(raw.timeParsed) : ((_L = raw.legacy) == null ? void 0 : _L.created_at) ? new Date((_M = raw.legacy) == null ? void 0 : _M.created_at) : void 0,
      timestamp: raw.timestamp ?? (((_N = raw.legacy) == null ? void 0 : _N.created_at) ? new Date(raw.legacy.created_at).getTime() / 1e3 : void 0),
      urls: raw.urls ?? ((_P = (_O = raw.legacy) == null ? void 0 : _O.entities) == null ? void 0 : _P.urls) ?? [],
      userId: raw.userId ?? ((_Q = raw.legacy) == null ? void 0 : _Q.user_id_str) ?? void 0,
      username: raw.username ?? ((_U = (_T = (_S = (_R = raw.core) == null ? void 0 : _R.user_results) == null ? void 0 : _S.result) == null ? void 0 : _T.legacy) == null ? void 0 : _U.screen_name) ?? void 0,
      videos: raw.videos ?? (((_X = (_W = (_V = raw.legacy) == null ? void 0 : _V.entities) == null ? void 0 : _W.media) == null ? void 0 : _X.filter((media) => media.type === "video")) ?? []),
      views: ((_Y = raw.views) == null ? void 0 : _Y.count) ? Number(raw.views.count) : 0,
      sensitiveContent: raw.sensitiveContent
    };
    return t;
  }
  constructor(runtime, twitterConfig) {
    super();
    this.runtime = runtime;
    this.twitterConfig = twitterConfig;
    const username = twitterConfig.TWITTER_USERNAME;
    if (_ClientBase._twitterClients[username]) {
      this.twitterClient = _ClientBase._twitterClients[username];
    } else {
      this.twitterClient = new Scraper();
      _ClientBase._twitterClients[username] = this.twitterClient;
    }
    this.directions = "- " + this.runtime.character.style.all.join("\n- ") + "- " + this.runtime.character.style.post.join();
  }
  async init() {
    const username = this.twitterConfig.TWITTER_USERNAME;
    const password = this.twitterConfig.TWITTER_PASSWORD;
    const email = this.twitterConfig.TWITTER_EMAIL;
    let retries = this.twitterConfig.TWITTER_RETRY_LIMIT;
    const twitter2faSecret = this.twitterConfig.TWITTER_2FA_SECRET;
    if (!username) {
      throw new Error("Twitter username not configured");
    }
    const authToken = this.runtime.getSetting("TWITTER_COOKIES_AUTH_TOKEN");
    const ct0 = this.runtime.getSetting("TWITTER_COOKIES_CT0");
    const guestId = this.runtime.getSetting("TWITTER_COOKIES_GUEST_ID");
    const createTwitterCookies = (authToken2, ct02, guestId2) => authToken2 && ct02 && guestId2 ? [
      { key: "auth_token", value: authToken2, domain: ".twitter.com" },
      { key: "ct0", value: ct02, domain: ".twitter.com" },
      { key: "guest_id", value: guestId2, domain: ".twitter.com" }
    ] : null;
    const cachedCookies = await this.getCachedCookies(username) || createTwitterCookies(authToken, ct0, guestId);
    if (cachedCookies) {
      elizaLogger.info("Using cached cookies");
      await this.setCookiesFromArray(cachedCookies);
    }
    elizaLogger.log("Waiting for Twitter login");
    while (retries > 0) {
      try {
        if (await this.twitterClient.isLoggedIn()) {
          elizaLogger.info("Successfully logged in.");
          break;
        } else {
          await this.twitterClient.login(
            username,
            password,
            email,
            twitter2faSecret
          );
          if (await this.twitterClient.isLoggedIn()) {
            elizaLogger.info("Successfully logged in.");
            elizaLogger.info("Caching cookies");
            await this.cacheCookies(
              username,
              await this.twitterClient.getCookies()
            );
            break;
          }
        }
      } catch (error) {
        elizaLogger.error(`Login attempt failed: ${error.message}`);
      }
      retries--;
      elizaLogger.error(
        `Failed to login to Twitter. Retrying... (${retries} attempts left)`
      );
      if (retries === 0) {
        elizaLogger.error(
          "Max retries reached. Exiting login process."
        );
        throw new Error("Twitter login failed after maximum retries.");
      }
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }
    this.profile = await this.fetchProfile(username);
    if (this.profile) {
      elizaLogger.log("Twitter user ID:", this.profile.id);
      elizaLogger.log(
        "Twitter loaded:",
        JSON.stringify(this.profile, null, 10)
      );
      this.runtime.character.twitterProfile = {
        id: this.profile.id,
        username: this.profile.username,
        screenName: this.profile.screenName,
        bio: this.profile.bio,
        nicknames: this.profile.nicknames
      };
    } else {
      throw new Error("Failed to load profile");
    }
    await this.loadLatestCheckedTweetId();
    await this.populateTimeline();
  }
  async fetchOwnPosts(count) {
    elizaLogger.debug("fetching own posts");
    const homeTimeline = await this.twitterClient.getUserTweets(
      this.profile.id,
      count
    );
    return homeTimeline.tweets.map((t) => this.parseTweet(t));
  }
  /**
   * Fetch timeline for twitter account, optionally only from followed accounts
   */
  async fetchHomeTimeline(count, following) {
    elizaLogger.debug("fetching home timeline");
    const homeTimeline = following ? await this.twitterClient.fetchFollowingTimeline(count, []) : await this.twitterClient.fetchHomeTimeline(count, []);
    elizaLogger.debug(homeTimeline, { depth: Number.POSITIVE_INFINITY });
    const processedTimeline = homeTimeline.filter((t) => t.__typename !== "TweetWithVisibilityResults").map((tweet) => this.parseTweet(tweet));
    return processedTimeline;
  }
  async fetchTimelineForActions(count) {
    elizaLogger.debug("fetching timeline for actions");
    const agentUsername = this.twitterConfig.TWITTER_USERNAME;
    const homeTimeline = this.twitterConfig.ACTION_TIMELINE_TYPE === ActionTimelineType.Following ? await this.twitterClient.fetchFollowingTimeline(count, []) : await this.twitterClient.fetchHomeTimeline(count, []);
    return homeTimeline.map((tweet) => this.parseTweet(tweet)).filter((tweet) => tweet.username !== agentUsername).slice(0, count);
  }
  async fetchSearchTweets(query, maxTweets, searchMode, cursor) {
    try {
      const timeoutPromise = new Promise(
        (resolve) => setTimeout(() => resolve({ tweets: [] }), 15e3)
      );
      try {
        const result = await this.requestQueue.add(
          async () => await Promise.race([
            this.twitterClient.fetchSearchTweets(
              query,
              maxTweets,
              searchMode,
              cursor
            ),
            timeoutPromise
          ])
        );
        return result ?? { tweets: [] };
      } catch (error) {
        elizaLogger.error("Error fetching search tweets:", error);
        return { tweets: [] };
      }
    } catch (error) {
      elizaLogger.error("Error fetching search tweets:", error);
      return { tweets: [] };
    }
  }
  async populateTimeline() {
    elizaLogger.debug("populating timeline...");
    const cachedTimeline = await this.getCachedTimeline();
    if (cachedTimeline) {
      const existingMemories2 = await this.runtime.messageManager.getMemoriesByRoomIds({
        roomIds: cachedTimeline.map(
          (tweet) => stringToUuid(
            tweet.conversationId + "-" + this.runtime.agentId
          )
        )
      });
      const existingMemoryIds2 = new Set(
        existingMemories2.map((memory) => memory.id.toString())
      );
      const someCachedTweetsExist = cachedTimeline.some(
        (tweet) => existingMemoryIds2.has(
          stringToUuid(tweet.id + "-" + this.runtime.agentId)
        )
      );
      if (someCachedTweetsExist) {
        const tweetsToSave2 = cachedTimeline.filter(
          (tweet) => !existingMemoryIds2.has(
            stringToUuid(tweet.id + "-" + this.runtime.agentId)
          )
        );
        console.log({
          processingTweets: tweetsToSave2.map((tweet) => tweet.id).join(",")
        });
        for (const tweet of tweetsToSave2) {
          elizaLogger.log("Saving Tweet", tweet.id);
          const roomId = stringToUuid(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const userId = tweet.userId === this.profile.id ? this.runtime.agentId : stringToUuid(tweet.userId);
          if (tweet.userId === this.profile.id) {
            await this.runtime.ensureConnection(
              this.runtime.agentId,
              roomId,
              this.profile.username,
              this.profile.screenName,
              "twitter"
            );
          } else {
            await this.runtime.ensureConnection(
              userId,
              roomId,
              tweet.username,
              tweet.name,
              "twitter"
            );
          }
          const content = {
            text: tweet.text,
            url: tweet.permanentUrl,
            source: "twitter",
            inReplyTo: tweet.inReplyToStatusId ? stringToUuid(
              tweet.inReplyToStatusId + "-" + this.runtime.agentId
            ) : void 0
          };
          elizaLogger.log("Creating memory for tweet", tweet.id);
          const memory = await this.runtime.messageManager.getMemoryById(
            stringToUuid(tweet.id + "-" + this.runtime.agentId)
          );
          if (memory) {
            elizaLogger.log(
              "Memory already exists, skipping timeline population"
            );
            break;
          }
          await this.runtime.messageManager.createMemory({
            id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
            userId,
            content,
            agentId: this.runtime.agentId,
            roomId,
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp * 1e3
          });
          await this.cacheTweet(tweet);
        }
        elizaLogger.log(
          `Populated ${tweetsToSave2.length} missing tweets from the cache.`
        );
        return;
      }
    }
    const timeline = await this.fetchHomeTimeline(cachedTimeline ? 10 : 50);
    const username = this.twitterConfig.TWITTER_USERNAME;
    const mentionsAndInteractions = await this.fetchSearchTweets(
      `@${username}`,
      20,
      SearchMode.Latest
    );
    const allTweets = [...timeline, ...mentionsAndInteractions.tweets];
    const tweetIdsToCheck = /* @__PURE__ */ new Set();
    const roomIds = /* @__PURE__ */ new Set();
    for (const tweet of allTweets) {
      tweetIdsToCheck.add(tweet.id);
      roomIds.add(
        stringToUuid(tweet.conversationId + "-" + this.runtime.agentId)
      );
    }
    const existingMemories = await this.runtime.messageManager.getMemoriesByRoomIds({
      roomIds: Array.from(roomIds)
    });
    const existingMemoryIds = new Set(
      existingMemories.map((memory) => memory.id)
    );
    const tweetsToSave = allTweets.filter(
      (tweet) => !existingMemoryIds.has(
        stringToUuid(tweet.id + "-" + this.runtime.agentId)
      )
    );
    elizaLogger.debug({
      processingTweets: tweetsToSave.map((tweet) => tweet.id).join(",")
    });
    await this.runtime.ensureUserExists(
      this.runtime.agentId,
      this.profile.username,
      this.runtime.character.name,
      "twitter"
    );
    for (const tweet of tweetsToSave) {
      elizaLogger.log("Saving Tweet", tweet.id);
      const roomId = stringToUuid(
        tweet.conversationId + "-" + this.runtime.agentId
      );
      const userId = tweet.userId === this.profile.id ? this.runtime.agentId : stringToUuid(tweet.userId);
      if (tweet.userId === this.profile.id) {
        await this.runtime.ensureConnection(
          this.runtime.agentId,
          roomId,
          this.profile.username,
          this.profile.screenName,
          "twitter"
        );
      } else {
        await this.runtime.ensureConnection(
          userId,
          roomId,
          tweet.username,
          tweet.name,
          "twitter"
        );
      }
      const content = {
        text: tweet.text,
        url: tweet.permanentUrl,
        source: "twitter",
        inReplyTo: tweet.inReplyToStatusId ? stringToUuid(tweet.inReplyToStatusId) : void 0
      };
      await this.runtime.messageManager.createMemory({
        id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
        userId,
        content,
        agentId: this.runtime.agentId,
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1e3
      });
      await this.cacheTweet(tweet);
    }
    await this.cacheTimeline(timeline);
    await this.cacheMentions(mentionsAndInteractions.tweets);
  }
  async setCookiesFromArray(cookiesArray) {
    const cookieStrings = cookiesArray.map(
      (cookie) => `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${cookie.secure ? "Secure" : ""}; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${cookie.sameSite || "Lax"}`
    );
    await this.twitterClient.setCookies(cookieStrings);
  }
  async saveRequestMessage(message, state) {
    if (message.content.text) {
      const recentMessage = await this.runtime.messageManager.getMemories(
        {
          roomId: message.roomId,
          count: 1,
          unique: false
        }
      );
      if (recentMessage.length > 0 && recentMessage[0].content === message.content) {
        elizaLogger.debug("Message already saved", recentMessage[0].id);
      } else {
        await this.runtime.messageManager.createMemory({
          ...message,
          embedding: getEmbeddingZeroVector()
        });
      }
      await this.runtime.evaluate(message, {
        ...state,
        twitterClient: this.twitterClient
      });
    }
  }
  async loadLatestCheckedTweetId() {
    const latestCheckedTweetId = await this.runtime.cacheManager.get(
      `twitter/${this.profile.username}/latest_checked_tweet_id`
    );
    if (latestCheckedTweetId) {
      this.lastCheckedTweetId = BigInt(latestCheckedTweetId);
    }
  }
  async cacheLatestCheckedTweetId() {
    if (this.lastCheckedTweetId) {
      await this.runtime.cacheManager.set(
        `twitter/${this.profile.username}/latest_checked_tweet_id`,
        this.lastCheckedTweetId.toString()
      );
    }
  }
  async getCachedTimeline() {
    return await this.runtime.cacheManager.get(
      `twitter/${this.profile.username}/timeline`
    );
  }
  async cacheTimeline(timeline) {
    await this.runtime.cacheManager.set(
      `twitter/${this.profile.username}/timeline`,
      timeline,
      { expires: Date.now() + 10 * 1e3 }
    );
  }
  async cacheMentions(mentions) {
    await this.runtime.cacheManager.set(
      `twitter/${this.profile.username}/mentions`,
      mentions,
      { expires: Date.now() + 10 * 1e3 }
    );
  }
  async getCachedCookies(username) {
    return await this.runtime.cacheManager.get(
      `twitter/${username}/cookies`
    );
  }
  async cacheCookies(username, cookies) {
    await this.runtime.cacheManager.set(
      `twitter/${username}/cookies`,
      cookies
    );
  }
  async fetchProfile(username) {
    try {
      const profile = await this.requestQueue.add(async () => {
        var _a;
        const profile2 = await this.twitterClient.getProfile(username);
        return {
          id: profile2.userId,
          username,
          screenName: profile2.name || this.runtime.character.name,
          bio: profile2.biography || typeof this.runtime.character.bio === "string" ? this.runtime.character.bio : this.runtime.character.bio.length > 0 ? this.runtime.character.bio[0] : "",
          nicknames: ((_a = this.runtime.character.twitterProfile) == null ? void 0 : _a.nicknames) || []
        };
      });
      return profile;
    } catch (error) {
      console.error("Error fetching Twitter profile:", error);
      throw error;
    }
  }
};

// src/environment.ts
import {
  parseBooleanFromText,
  ActionTimelineType as ActionTimelineType2
} from "@elizaos/core";

// ../../../node_modules/zod/lib/index.mjs
var util;
(function(util2) {
  util2.assertEqual = (val) => val;
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
        fieldErrors[sub.path[0]].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var overrideErrorMap = errorMap;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var makeIssue = (params) => {
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === errorMap ? void 0 : errorMap
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message === null || message === void 0 ? void 0 : message.message;
})(errorUtil || (errorUtil = {}));
var _ZodEnum_cache;
var _ZodNativeEnum_cache;
var ParseInputLazyPath = class {
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (this._key instanceof Array) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    var _a, _b;
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message !== null && message !== void 0 ? message : ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: (_a = message !== null && message !== void 0 ? message : required_error) !== null && _a !== void 0 ? _a : ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: (_b = message !== null && message !== void 0 ? message : invalid_type_error) !== null && _b !== void 0 ? _b : ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    var _a;
    const ctx = {
      common: {
        issues: [],
        async: (_a = params === null || params === void 0 ? void 0 : params.async) !== null && _a !== void 0 ? _a : false,
        contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap
      },
      path: (params === null || params === void 0 ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    var _a, _b;
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if ((_b = (_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === null || _b === void 0 ? void 0 : _b.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
        async: true
      },
      path: (params === null || params === void 0 ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let regex = `([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d`;
  if (args.precision) {
    regex = `${regex}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    regex = `${regex}(\\.\\d+)?`;
  }
  return regex;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if (!decoded.typ || !decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch (_a) {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch (_a) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    var _a, _b;
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
      offset: (_a = options === null || options === void 0 ? void 0 : options.offset) !== null && _a !== void 0 ? _a : false,
      local: (_b = options === null || options === void 0 ? void 0 : options.local) !== null && _b !== void 0 ? _b : false,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options === null || options === void 0 ? void 0 : options.position,
      ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  var _a;
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / Math.pow(10, decCount);
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null, min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch (_a) {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  var _a;
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    return this._cached = { shape, keys };
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") ;
      else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          var _a, _b, _c, _d;
          const defaultError = (_c = (_b = (_a = this._def).errorMap) === null || _b === void 0 ? void 0 : _b.call(_a, issue, ctx).message) !== null && _c !== void 0 ? _c : ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: (_d = errorUtil.errToObj(message).message) !== null && _d !== void 0 ? _d : defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    util.objectKeys(mask).forEach((key) => {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    util.objectKeys(this.shape).forEach((key) => {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    util.objectKeys(this.shape).forEach((key) => {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    util.objectKeys(this.shape).forEach((key) => {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    });
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          errorMap
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          errorMap
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  constructor() {
    super(...arguments);
    _ZodEnum_cache.set(this, void 0);
  }
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f")) {
      __classPrivateFieldSet(this, _ZodEnum_cache, new Set(this._def.values), "f");
    }
    if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f").has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
_ZodEnum_cache = /* @__PURE__ */ new WeakMap();
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  constructor() {
    super(...arguments);
    _ZodNativeEnum_cache.set(this, void 0);
  }
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f")) {
      __classPrivateFieldSet(this, _ZodNativeEnum_cache, new Set(util.getValidEnumValues(this._def.values)), "f");
    }
    if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f").has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
_ZodNativeEnum_cache = /* @__PURE__ */ new WeakMap();
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return base;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return base;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({ status: status.value, value: result }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function custom(check, params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      var _a, _b;
      if (!check(data)) {
        const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
        const _fatal = (_b = (_a = p.fatal) !== null && _a !== void 0 ? _a : fatal) !== null && _b !== void 0 ? _b : true;
        const p2 = typeof p === "string" ? { message: p } : p;
        ctx.addIssue({ code: "custom", ...p2, fatal: _fatal });
      }
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;
var z = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  defaultErrorMap: errorMap,
  setErrorMap,
  getErrorMap,
  makeIssue,
  EMPTY_PATH,
  addIssueToContext,
  ParseStatus,
  INVALID,
  DIRTY,
  OK,
  isAborted,
  isDirty,
  isValid,
  isAsync,
  get util() {
    return util;
  },
  get objectUtil() {
    return objectUtil;
  },
  ZodParsedType,
  getParsedType,
  ZodType,
  datetimeRegex,
  ZodString,
  ZodNumber,
  ZodBigInt,
  ZodBoolean,
  ZodDate,
  ZodSymbol,
  ZodUndefined,
  ZodNull,
  ZodAny,
  ZodUnknown,
  ZodNever,
  ZodVoid,
  ZodArray,
  ZodObject,
  ZodUnion,
  ZodDiscriminatedUnion,
  ZodIntersection,
  ZodTuple,
  ZodRecord,
  ZodMap,
  ZodSet,
  ZodFunction,
  ZodLazy,
  ZodLiteral,
  ZodEnum,
  ZodNativeEnum,
  ZodPromise,
  ZodEffects,
  ZodTransformer: ZodEffects,
  ZodOptional,
  ZodNullable,
  ZodDefault,
  ZodCatch,
  ZodNaN,
  BRAND,
  ZodBranded,
  ZodPipeline,
  ZodReadonly,
  custom,
  Schema: ZodType,
  ZodSchema: ZodType,
  late,
  get ZodFirstPartyTypeKind() {
    return ZodFirstPartyTypeKind;
  },
  coerce,
  any: anyType,
  array: arrayType,
  bigint: bigIntType,
  boolean: booleanType,
  date: dateType,
  discriminatedUnion: discriminatedUnionType,
  effect: effectsType,
  "enum": enumType,
  "function": functionType,
  "instanceof": instanceOfType,
  intersection: intersectionType,
  lazy: lazyType,
  literal: literalType,
  map: mapType,
  nan: nanType,
  nativeEnum: nativeEnumType,
  never: neverType,
  "null": nullType,
  nullable: nullableType,
  number: numberType,
  object: objectType,
  oboolean,
  onumber,
  optional: optionalType,
  ostring,
  pipeline: pipelineType,
  preprocess: preprocessType,
  promise: promiseType,
  record: recordType,
  set: setType,
  strictObject: strictObjectType,
  string: stringType,
  symbol: symbolType,
  transformer: effectsType,
  tuple: tupleType,
  "undefined": undefinedType,
  union: unionType,
  unknown: unknownType,
  "void": voidType,
  NEVER,
  ZodIssueCode,
  quotelessJson,
  ZodError
});

// src/environment.ts
var DEFAULT_MAX_TWEET_LENGTH = 280;
var twitterUsernameSchema = z.string().min(1, "An X/Twitter Username must be at least 1 character long").max(15, "An X/Twitter Username cannot exceed 15 characters").refine((username) => {
  if (username === "*") return true;
  return /^[A-Za-z0-9_]+$/.test(username);
}, "An X Username can only contain letters, numbers, and underscores");
var twitterEnvSchema = z.object({
  TWITTER_DRY_RUN: z.boolean(),
  TWITTER_USERNAME: z.string().min(1, "X/Twitter username is required"),
  TWITTER_PASSWORD: z.string().min(1, "X/Twitter password is required"),
  TWITTER_EMAIL: z.string().email("Valid X/Twitter email is required"),
  MAX_TWEET_LENGTH: z.number().int().default(DEFAULT_MAX_TWEET_LENGTH),
  TWITTER_SEARCH_ENABLE: z.boolean().default(false),
  TWITTER_2FA_SECRET: z.string(),
  TWITTER_RETRY_LIMIT: z.number().int(),
  TWITTER_POLL_INTERVAL: z.number().int(),
  TWITTER_TARGET_USERS: z.array(twitterUsernameSchema).default([]),
  // I guess it's possible to do the transformation with zod
  // not sure it's preferable, maybe a readability issue
  // since more people will know js/ts than zod
  /*
      z
      .string()
      .transform((val) => val.trim())
      .pipe(
          z.string()
              .transform((val) =>
                  val ? val.split(',').map((u) => u.trim()).filter(Boolean) : []
              )
              .pipe(
                  z.array(
                      z.string()
                          .min(1)
                          .max(15)
                          .regex(
                              /^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$|^[A-Za-z]$/,
                              'Invalid Twitter username format'
                          )
                  )
              )
              .transform((users) => users.join(','))
      )
      .optional()
      .default(''),
  */
  ENABLE_TWITTER_POST_GENERATION: z.boolean(),
  POST_INTERVAL_MIN: z.number().int(),
  POST_INTERVAL_MAX: z.number().int(),
  ENABLE_ACTION_PROCESSING: z.boolean(),
  ACTION_INTERVAL: z.number().int(),
  POST_IMMEDIATELY: z.boolean(),
  TWITTER_SPACES_ENABLE: z.boolean().default(false),
  MAX_ACTIONS_PROCESSING: z.number().int(),
  ACTION_TIMELINE_TYPE: z.nativeEnum(ActionTimelineType2).default(ActionTimelineType2.ForYou)
});
function parseTargetUsers(targetUsersStr) {
  if (!(targetUsersStr == null ? void 0 : targetUsersStr.trim())) {
    return [];
  }
  return targetUsersStr.split(",").map((user) => user.trim()).filter(Boolean);
}
function safeParseInt(value, defaultValue) {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : Math.max(1, parsed);
}
async function validateTwitterConfig(runtime) {
  try {
    const twitterConfig = {
      TWITTER_DRY_RUN: parseBooleanFromText(
        runtime.getSetting("TWITTER_DRY_RUN") || process.env.TWITTER_DRY_RUN
      ) ?? false,
      // parseBooleanFromText return null if "", map "" to false
      TWITTER_USERNAME: runtime.getSetting("TWITTER_USERNAME") || process.env.TWITTER_USERNAME,
      TWITTER_PASSWORD: runtime.getSetting("TWITTER_PASSWORD") || process.env.TWITTER_PASSWORD,
      TWITTER_EMAIL: runtime.getSetting("TWITTER_EMAIL") || process.env.TWITTER_EMAIL,
      // number as string?
      MAX_TWEET_LENGTH: safeParseInt(
        runtime.getSetting("MAX_TWEET_LENGTH") || process.env.MAX_TWEET_LENGTH,
        DEFAULT_MAX_TWEET_LENGTH
      ),
      TWITTER_SEARCH_ENABLE: parseBooleanFromText(
        runtime.getSetting("TWITTER_SEARCH_ENABLE") || process.env.TWITTER_SEARCH_ENABLE
      ) ?? false,
      // string passthru
      TWITTER_2FA_SECRET: runtime.getSetting("TWITTER_2FA_SECRET") || process.env.TWITTER_2FA_SECRET || "",
      // int
      TWITTER_RETRY_LIMIT: safeParseInt(
        runtime.getSetting("TWITTER_RETRY_LIMIT") || process.env.TWITTER_RETRY_LIMIT,
        5
      ),
      // int in seconds
      TWITTER_POLL_INTERVAL: safeParseInt(
        runtime.getSetting("TWITTER_POLL_INTERVAL") || process.env.TWITTER_POLL_INTERVAL,
        120
        // 2m
      ),
      // comma separated string
      TWITTER_TARGET_USERS: parseTargetUsers(
        runtime.getSetting("TWITTER_TARGET_USERS") || process.env.TWITTER_TARGET_USERS
      ),
      // bool
      ENABLE_TWITTER_POST_GENERATION: parseBooleanFromText(
        runtime.getSetting("ENABLE_TWITTER_POST_GENERATION") || process.env.ENABLE_TWITTER_POST_GENERATION
      ) ?? true,
      // int in minutes
      POST_INTERVAL_MIN: safeParseInt(
        runtime.getSetting("POST_INTERVAL_MIN") || process.env.POST_INTERVAL_MIN,
        90
        // 1.5 hours
      ),
      // int in minutes
      POST_INTERVAL_MAX: safeParseInt(
        runtime.getSetting("POST_INTERVAL_MAX") || process.env.POST_INTERVAL_MAX,
        180
        // 3 hours
      ),
      // bool
      ENABLE_ACTION_PROCESSING: parseBooleanFromText(
        runtime.getSetting("ENABLE_ACTION_PROCESSING") || process.env.ENABLE_ACTION_PROCESSING
      ) ?? false,
      // init in minutes (min 1m)
      ACTION_INTERVAL: safeParseInt(
        runtime.getSetting("ACTION_INTERVAL") || process.env.ACTION_INTERVAL,
        5
        // 5 minutes
      ),
      // bool
      POST_IMMEDIATELY: parseBooleanFromText(
        runtime.getSetting("POST_IMMEDIATELY") || process.env.POST_IMMEDIATELY
      ) ?? false,
      TWITTER_SPACES_ENABLE: parseBooleanFromText(
        runtime.getSetting("TWITTER_SPACES_ENABLE") || process.env.TWITTER_SPACES_ENABLE
      ) ?? false,
      MAX_ACTIONS_PROCESSING: safeParseInt(
        runtime.getSetting("MAX_ACTIONS_PROCESSING") || process.env.MAX_ACTIONS_PROCESSING,
        1
      ),
      ACTION_TIMELINE_TYPE: runtime.getSetting("ACTION_TIMELINE_TYPE") || process.env.ACTION_TIMELINE_TYPE
    };
    return twitterEnvSchema.parse(twitterConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `X/Twitter configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/interactions.ts
import { SearchMode as SearchMode2 } from "agent-twitter-client";
import {
  composeContext,
  generateMessageResponse,
  generateShouldRespond,
  messageCompletionFooter,
  shouldRespondFooter,
  ModelClass,
  stringToUuid as stringToUuid3,
  elizaLogger as elizaLogger3,
  getEmbeddingZeroVector as getEmbeddingZeroVector3,
  ServiceType
} from "@elizaos/core";

// src/utils.ts
import { getEmbeddingZeroVector as getEmbeddingZeroVector2 } from "@elizaos/core";
import { stringToUuid as stringToUuid2 } from "@elizaos/core";
import { elizaLogger as elizaLogger2 } from "@elizaos/core";
import fs from "fs";
import path from "path";
var wait = (minTime = 1e3, maxTime = 3e3) => {
  const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};
async function buildConversationThread(tweet, client, maxReplies = 10) {
  const thread = [];
  const visited = /* @__PURE__ */ new Set();
  async function processThread(currentTweet, depth = 0) {
    var _a;
    elizaLogger2.debug("Processing tweet:", {
      id: currentTweet.id,
      inReplyToStatusId: currentTweet.inReplyToStatusId,
      depth
    });
    if (!currentTweet) {
      elizaLogger2.debug("No current tweet found for thread building");
      return;
    }
    if (depth >= maxReplies) {
      elizaLogger2.debug("Reached maximum reply depth", depth);
      return;
    }
    const memory = await client.runtime.messageManager.getMemoryById(
      stringToUuid2(currentTweet.id + "-" + client.runtime.agentId)
    );
    if (!memory) {
      const roomId = stringToUuid2(
        currentTweet.conversationId + "-" + client.runtime.agentId
      );
      const userId = stringToUuid2(currentTweet.userId);
      await client.runtime.ensureConnection(
        userId,
        roomId,
        currentTweet.username,
        currentTweet.name,
        "twitter"
      );
      await client.runtime.messageManager.createMemory({
        id: stringToUuid2(
          currentTweet.id + "-" + client.runtime.agentId
        ),
        agentId: client.runtime.agentId,
        content: {
          text: currentTweet.text,
          source: "twitter",
          url: currentTweet.permanentUrl,
          imageUrls: currentTweet.photos.map((p) => p.url) || [],
          inReplyTo: currentTweet.inReplyToStatusId ? stringToUuid2(
            currentTweet.inReplyToStatusId + "-" + client.runtime.agentId
          ) : void 0
        },
        createdAt: currentTweet.timestamp * 1e3,
        roomId,
        userId: currentTweet.userId === client.profile.id ? client.runtime.agentId : stringToUuid2(currentTweet.userId),
        embedding: getEmbeddingZeroVector2()
      });
    }
    if (visited.has(currentTweet.id)) {
      elizaLogger2.debug("Already visited tweet:", currentTweet.id);
      return;
    }
    visited.add(currentTweet.id);
    thread.unshift(currentTweet);
    elizaLogger2.debug("Current thread state:", {
      length: thread.length,
      currentDepth: depth,
      tweetId: currentTweet.id
    });
    if (currentTweet.inReplyToStatusId) {
      elizaLogger2.debug(
        "Fetching parent tweet:",
        currentTweet.inReplyToStatusId
      );
      try {
        const parentTweet = await client.twitterClient.getTweet(
          currentTweet.inReplyToStatusId
        );
        if (parentTweet) {
          elizaLogger2.debug("Found parent tweet:", {
            id: parentTweet.id,
            text: (_a = parentTweet.text) == null ? void 0 : _a.slice(0, 50)
          });
          await processThread(parentTweet, depth + 1);
        } else {
          elizaLogger2.debug(
            "No parent tweet found for:",
            currentTweet.inReplyToStatusId
          );
        }
      } catch (error) {
        elizaLogger2.error("Error fetching parent tweet:", {
          tweetId: currentTweet.inReplyToStatusId,
          error
        });
      }
    } else {
      elizaLogger2.debug(
        "Reached end of reply chain at:",
        currentTweet.id
      );
    }
  }
  await processThread(tweet, 0);
  elizaLogger2.debug("Final thread built:", {
    totalTweets: thread.length,
    tweetIds: thread.map((t) => {
      var _a;
      return {
        id: t.id,
        text: (_a = t.text) == null ? void 0 : _a.slice(0, 50)
      };
    })
  });
  return thread;
}
async function fetchMediaData(attachments) {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (/^(http|https):\/\//.test(attachment.url)) {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${attachment.url}`);
        }
        const mediaBuffer = Buffer.from(await response.arrayBuffer());
        const mediaType = attachment.contentType;
        return { data: mediaBuffer, mediaType };
      } else if (fs.existsSync(attachment.url)) {
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
async function sendTweet(client, content, roomId, twitterUsername, inReplyTo) {
  var _a, _b, _c, _d, _e, _f;
  const maxTweetLength = client.twitterConfig.MAX_TWEET_LENGTH;
  const isLongTweet = maxTweetLength > 280;
  const tweetChunks = splitTweetContent(content.text, maxTweetLength);
  const sentTweets = [];
  let previousTweetId = inReplyTo;
  for (const chunk of tweetChunks) {
    let mediaData = null;
    if (content.attachments && content.attachments.length > 0) {
      mediaData = await fetchMediaData(content.attachments);
    }
    const cleanChunk = deduplicateMentions(chunk.trim());
    const result = await client.requestQueue.add(
      async () => isLongTweet ? client.twitterClient.sendLongTweet(
        cleanChunk,
        previousTweetId,
        mediaData
      ) : client.twitterClient.sendTweet(
        cleanChunk,
        previousTweetId,
        mediaData
      )
    );
    const body = await result.json();
    const tweetResult = isLongTweet ? (_c = (_b = (_a = body == null ? void 0 : body.data) == null ? void 0 : _a.notetweet_create) == null ? void 0 : _b.tweet_results) == null ? void 0 : _c.result : (_f = (_e = (_d = body == null ? void 0 : body.data) == null ? void 0 : _d.create_tweet) == null ? void 0 : _e.tweet_results) == null ? void 0 : _f.result;
    if (tweetResult) {
      const finalTweet = {
        id: tweetResult.rest_id,
        text: tweetResult.legacy.full_text,
        conversationId: tweetResult.legacy.conversation_id_str,
        timestamp: new Date(tweetResult.legacy.created_at).getTime() / 1e3,
        userId: tweetResult.legacy.user_id_str,
        inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
        permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: []
      };
      sentTweets.push(finalTweet);
      previousTweetId = finalTweet.id;
    } else {
      elizaLogger2.error("Error sending tweet chunk:", {
        chunk,
        response: body
      });
    }
    await wait(1e3, 2e3);
  }
  const memories = sentTweets.map((tweet) => ({
    id: stringToUuid2(tweet.id + "-" + client.runtime.agentId),
    agentId: client.runtime.agentId,
    userId: client.runtime.agentId,
    content: {
      tweetId: tweet.id,
      text: tweet.text,
      source: "twitter",
      url: tweet.permanentUrl,
      imageUrls: tweet.photos.map((p) => p.url) || [],
      inReplyTo: tweet.inReplyToStatusId ? stringToUuid2(
        tweet.inReplyToStatusId + "-" + client.runtime.agentId
      ) : void 0
    },
    roomId,
    embedding: getEmbeddingZeroVector2(),
    createdAt: tweet.timestamp * 1e3
  }));
  return memories;
}
function splitTweetContent(content, maxLength) {
  const paragraphs = content.split("\n\n").map((p) => p.trim());
  const tweets = [];
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
function extractUrls(paragraph) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const placeholderMap = /* @__PURE__ */ new Map();
  let urlIndex = 0;
  const textWithPlaceholders = paragraph.replace(urlRegex, (match) => {
    const placeholder = `<<URL_CONSIDERER_23_${urlIndex}>>`;
    placeholderMap.set(placeholder, match);
    urlIndex++;
    return placeholder;
  });
  return { textWithPlaceholders, placeholderMap };
}
function splitSentencesAndWords(text, maxLength) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let currentChunk = "";
  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length <= maxLength) {
      if (currentChunk) {
        currentChunk += " " + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      if (sentence.length <= maxLength) {
        currentChunk = sentence;
      } else {
        const words = sentence.split(" ");
        currentChunk = "";
        for (const word of words) {
          if ((currentChunk + " " + word).trim().length <= maxLength) {
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
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
function deduplicateMentions(paragraph) {
  const mentionRegex = /^@(\w+)(?:\s+@(\w+))*(\s+|$)/;
  const matches = paragraph.match(mentionRegex);
  if (!matches) {
    return paragraph;
  }
  let mentions = matches.slice(0, 1)[0].trim().split(" ");
  mentions = [...new Set(mentions)];
  const uniqueMentionsString = mentions.join(" ");
  const endOfMentions = paragraph.indexOf(matches[0]) + matches[0].length;
  return uniqueMentionsString + " " + paragraph.slice(endOfMentions);
}
function restoreUrls(chunks, placeholderMap) {
  return chunks.map((chunk) => {
    return chunk.replace(/<<URL_CONSIDERER_23_(\d+)>>/g, (match) => {
      const original = placeholderMap.get(match);
      return original || match;
    });
  });
}
function splitParagraph(paragraph, maxLength) {
  const { textWithPlaceholders, placeholderMap } = extractUrls(paragraph);
  const splittedChunks = splitSentencesAndWords(
    textWithPlaceholders,
    maxLength
  );
  const restoredChunks = restoreUrls(splittedChunks, placeholderMap);
  return restoredChunks;
}

// src/interactions.ts
var twitterMessageHandlerTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}

# TASK: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:

Current Post:
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). You MUST include an action if the current post text includes a prompt that is similar to one of the available actions mentioned here:
{{actionNames}}
{{actions}}

Here is the current post text again. Remember to include an action if the current post text includes a prompt that asks for one of the available actions mentioned above (does not need to be exact)
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}
` + messageCompletionFooter;
var twitterShouldRespondTemplate = (targetUsersStr) => `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should respond to the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

Response options are RESPOND, IGNORE and STOP.

PRIORITY RULE: ALWAYS RESPOND to these users regardless of topic or message content: ${targetUsersStr}. Topic relevance should be ignored for these users.

For other users:
- {{agentName}} should RESPOND to messages directed at them
- {{agentName}} should RESPOND to conversations relevant to their background
- {{agentName}} should IGNORE irrelevant messages
- {{agentName}} should IGNORE very short messages unless directly addressed
- {{agentName}} should STOP if asked to stop
- {{agentName}} should STOP if conversation is concluded
- {{agentName}} is in a room with other users and wants to be conversational, but not annoying.

IMPORTANT:
- {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.
- For users not in the priority list, {{agentName}} (@{{twitterUserName}}) should err on the side of IGNORE rather than RESPOND if in doubt.

Recent Posts:
{{recentPosts}}

Current Post:
{{currentPost}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
` + shouldRespondFooter;
var TwitterInteractionClient = class {
  client;
  runtime;
  isDryRun;
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
    this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
  }
  async start() {
    const handleTwitterInteractionsLoop = () => {
      this.handleTwitterInteractions();
      setTimeout(
        handleTwitterInteractionsLoop,
        // Defaults to 2 minutes
        this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1e3
      );
    };
    handleTwitterInteractionsLoop();
  }
  async handleTwitterInteractions() {
    var _a, _b;
    elizaLogger3.log("Checking Twitter interactions");
    const twitterUsername = this.client.profile.username;
    try {
      const mentionCandidates = (await this.client.fetchSearchTweets(
        `@${twitterUsername}`,
        20,
        SearchMode2.Latest
      )).tweets;
      elizaLogger3.log(
        "Completed checking mentioned tweets:",
        mentionCandidates.length
      );
      let uniqueTweetCandidates = [...mentionCandidates];
      if (this.client.twitterConfig.TWITTER_TARGET_USERS.length) {
        const TARGET_USERS = this.client.twitterConfig.TWITTER_TARGET_USERS;
        elizaLogger3.log("Processing target users:", TARGET_USERS);
        if (TARGET_USERS.length > 0) {
          const tweetsByUser = /* @__PURE__ */ new Map();
          for (const username of TARGET_USERS) {
            try {
              const userTweets = (await this.client.twitterClient.fetchSearchTweets(
                `from:${username}`,
                3,
                SearchMode2.Latest
              )).tweets;
              const validTweets = userTweets.filter((tweet) => {
                const isUnprocessed = !this.client.lastCheckedTweetId || Number.parseInt(tweet.id) > this.client.lastCheckedTweetId;
                const isRecent = Date.now() - tweet.timestamp * 1e3 < 2 * 60 * 60 * 1e3;
                elizaLogger3.log(`Tweet ${tweet.id} checks:`, {
                  isUnprocessed,
                  isRecent,
                  isReply: tweet.isReply,
                  isRetweet: tweet.isRetweet
                });
                return isUnprocessed && !tweet.isReply && !tweet.isRetweet && isRecent;
              });
              if (validTweets.length > 0) {
                tweetsByUser.set(username, validTweets);
                elizaLogger3.log(
                  `Found ${validTweets.length} valid tweets from ${username}`
                );
              }
            } catch (error) {
              elizaLogger3.error(
                `Error fetching tweets for ${username}:`,
                error
              );
              continue;
            }
          }
          const selectedTweets = [];
          for (const [username, tweets] of tweetsByUser) {
            if (tweets.length > 0) {
              const randomTweet = tweets[Math.floor(Math.random() * tweets.length)];
              selectedTweets.push(randomTweet);
              elizaLogger3.log(
                `Selected tweet from ${username}: ${(_a = randomTweet.text) == null ? void 0 : _a.substring(0, 100)}`
              );
            }
          }
          uniqueTweetCandidates = [
            ...mentionCandidates,
            ...selectedTweets
          ];
        }
      } else {
        elizaLogger3.log(
          "No target users configured, processing only mentions"
        );
      }
      uniqueTweetCandidates.sort((a, b) => a.id.localeCompare(b.id)).filter((tweet) => tweet.userId !== this.client.profile.id);
      for (const tweet of uniqueTweetCandidates) {
        if (!this.client.lastCheckedTweetId || BigInt(tweet.id) > this.client.lastCheckedTweetId) {
          const tweetId = stringToUuid3(
            tweet.id + "-" + this.runtime.agentId
          );
          const existingResponse = await this.runtime.messageManager.getMemoryById(
            tweetId
          );
          if (existingResponse) {
            elizaLogger3.log(
              `Already responded to tweet ${tweet.id}, skipping`
            );
            continue;
          }
          elizaLogger3.log("New Tweet found", tweet.permanentUrl);
          const roomId = stringToUuid3(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const userIdUUID = tweet.userId === this.client.profile.id ? this.runtime.agentId : stringToUuid3(tweet.userId);
          await this.runtime.ensureConnection(
            userIdUUID,
            roomId,
            tweet.username,
            tweet.name,
            "twitter"
          );
          const thread = await buildConversationThread(
            tweet,
            this.client
          );
          const message = {
            content: {
              text: tweet.text,
              imageUrls: ((_b = tweet.photos) == null ? void 0 : _b.map((photo) => photo.url)) || []
            },
            agentId: this.runtime.agentId,
            userId: userIdUUID,
            roomId
          };
          await this.handleTweet({
            tweet,
            message,
            thread
          });
          this.client.lastCheckedTweetId = BigInt(tweet.id);
        }
      }
      await this.client.cacheLatestCheckedTweetId();
      elizaLogger3.log("Finished checking Twitter interactions");
    } catch (error) {
      elizaLogger3.error("Error handling Twitter interactions:", error);
    }
  }
  async handleTweet({
    tweet,
    message,
    thread
  }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    if (tweet.userId === this.client.profile.id && !this.client.twitterConfig.TWITTER_TARGET_USERS.includes(tweet.username)) {
      return;
    }
    if (!message.content.text) {
      elizaLogger3.log("Skipping Tweet with no text", tweet.id);
      return { text: "", action: "IGNORE" };
    }
    elizaLogger3.log("Processing Tweet: ", tweet.id);
    const formatTweet = (tweet2) => {
      return `  ID: ${tweet2.id}
  From: ${tweet2.name} (@${tweet2.username})
  Text: ${tweet2.text}`;
    };
    const currentPost = formatTweet(tweet);
    const formattedConversation = thread.map(
      (tweet2) => `@${tweet2.username} (${new Date(
        tweet2.timestamp * 1e3
      ).toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric"
      })}):
        ${tweet2.text}`
    ).join("\n\n");
    const imageDescriptionsArray = [];
    try {
      for (const photo of tweet.photos) {
        const description = await this.runtime.getService(
          ServiceType.IMAGE_DESCRIPTION
        ).describeImage(photo.url);
        imageDescriptionsArray.push(description);
      }
    } catch (error) {
      elizaLogger3.error("Error Occured during describing image: ", error);
    }
    let state = await this.runtime.composeState(message, {
      twitterClient: this.client.twitterClient,
      twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
      currentPost,
      formattedConversation,
      imageDescriptions: imageDescriptionsArray.length > 0 ? `
Images in Tweet:
${imageDescriptionsArray.map((desc, i) => `Image ${i + 1}: Title: ${desc.title}
Description: ${desc.description}`).join("\n\n")}` : ""
    });
    const tweetId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
    const tweetExists = await this.runtime.messageManager.getMemoryById(tweetId);
    if (!tweetExists) {
      elizaLogger3.log("tweet does not exist, saving");
      const userIdUUID = stringToUuid3(tweet.userId);
      const roomId = stringToUuid3(tweet.conversationId);
      const message2 = {
        id: tweetId,
        agentId: this.runtime.agentId,
        content: {
          text: tweet.text,
          url: tweet.permanentUrl,
          imageUrls: ((_a = tweet.photos) == null ? void 0 : _a.map((photo) => photo.url)) || [],
          inReplyTo: tweet.inReplyToStatusId ? stringToUuid3(
            tweet.inReplyToStatusId + "-" + this.runtime.agentId
          ) : void 0
        },
        userId: userIdUUID,
        roomId,
        createdAt: tweet.timestamp * 1e3
      };
      this.client.saveRequestMessage(message2, state);
    }
    const validTargetUsersStr = this.client.twitterConfig.TWITTER_TARGET_USERS.join(",");
    const shouldRespondContext = composeContext({
      state,
      template: ((_b = this.runtime.character.templates) == null ? void 0 : _b.twitterShouldRespondTemplate) || ((_d = (_c = this.runtime.character) == null ? void 0 : _c.templates) == null ? void 0 : _d.shouldRespondTemplate) || twitterShouldRespondTemplate(validTargetUsersStr)
    });
    const shouldRespond = await generateShouldRespond({
      runtime: this.runtime,
      context: shouldRespondContext,
      modelClass: ModelClass.MEDIUM
    });
    if (shouldRespond !== "RESPOND") {
      elizaLogger3.log("Not responding to message");
      return { text: "Response Decision:", action: shouldRespond };
    }
    const context = composeContext({
      state: {
        ...state,
        // Convert actionNames array to string
        actionNames: Array.isArray(state.actionNames) ? state.actionNames.join(", ") : state.actionNames || "",
        actions: Array.isArray(state.actions) ? state.actions.join("\n") : state.actions || "",
        // Ensure character examples are included
        characterPostExamples: this.runtime.character.messageExamples ? this.runtime.character.messageExamples.map(
          (example) => example.map(
            (msg) => `${msg.user}: ${msg.content.text}${msg.content.action ? ` [Action: ${msg.content.action}]` : ""}`
          ).join("\n")
        ).join("\n\n") : ""
      },
      template: ((_e = this.runtime.character.templates) == null ? void 0 : _e.twitterMessageHandlerTemplate) || ((_g = (_f = this.runtime.character) == null ? void 0 : _f.templates) == null ? void 0 : _g.messageHandlerTemplate) || twitterMessageHandlerTemplate
    });
    const response = await generateMessageResponse({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.LARGE
    });
    const removeQuotes = (str) => str.replace(/^['"](.*)['"]$/, "$1");
    const stringId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
    response.inReplyTo = stringId;
    response.text = removeQuotes(response.text);
    if (response.text) {
      if (this.isDryRun) {
        elizaLogger3.info(
          `Dry run: Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}
Agent's Output:
${response.text}`
        );
      } else {
        try {
          const callback = async (response2, tweetId2) => {
            const memories = await sendTweet(
              this.client,
              response2,
              message.roomId,
              this.client.twitterConfig.TWITTER_USERNAME,
              tweetId2 || tweet.id
            );
            return memories;
          };
          const action = this.runtime.actions.find((a) => a.name === response.action);
          const shouldSuppressInitialMessage = action == null ? void 0 : action.suppressInitialMessage;
          let responseMessages = [];
          if (!shouldSuppressInitialMessage) {
            responseMessages = await callback(response);
          } else {
            responseMessages = [{
              id: stringToUuid3(tweet.id + "-" + this.runtime.agentId),
              userId: this.runtime.agentId,
              agentId: this.runtime.agentId,
              content: response,
              roomId: message.roomId,
              embedding: getEmbeddingZeroVector3(),
              createdAt: Date.now()
            }];
          }
          state = await this.runtime.updateRecentMessageState(
            state
          );
          for (const responseMessage of responseMessages) {
            if (responseMessage === responseMessages[responseMessages.length - 1]) {
              responseMessage.content.action = response.action;
            } else {
              responseMessage.content.action = "CONTINUE";
            }
            await this.runtime.messageManager.createMemory(
              responseMessage
            );
          }
          const responseTweetId = (_i = (_h = responseMessages[responseMessages.length - 1]) == null ? void 0 : _h.content) == null ? void 0 : _i.tweetId;
          await this.runtime.processActions(
            message,
            responseMessages,
            state,
            (response2) => {
              return callback(response2, responseTweetId);
            }
          );
          const responseInfo = `Context:

${context}

Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}
Agent's Output:
${response.text}`;
          await this.runtime.cacheManager.set(
            `twitter/tweet_generation_${tweet.id}.txt`,
            responseInfo
          );
          await wait();
        } catch (error) {
          elizaLogger3.error(`Error sending response tweet: ${error}`);
        }
      }
    }
  }
  async buildConversationThread(tweet, maxReplies = 10) {
    const thread = [];
    const visited = /* @__PURE__ */ new Set();
    async function processThread(currentTweet, depth = 0) {
      var _a, _b;
      elizaLogger3.log("Processing tweet:", {
        id: currentTweet.id,
        inReplyToStatusId: currentTweet.inReplyToStatusId,
        depth
      });
      if (!currentTweet) {
        elizaLogger3.log("No current tweet found for thread building");
        return;
      }
      if (depth >= maxReplies) {
        elizaLogger3.log("Reached maximum reply depth", depth);
        return;
      }
      const memory = await this.runtime.messageManager.getMemoryById(
        stringToUuid3(currentTweet.id + "-" + this.runtime.agentId)
      );
      if (!memory) {
        const roomId = stringToUuid3(
          currentTweet.conversationId + "-" + this.runtime.agentId
        );
        const userId = stringToUuid3(currentTweet.userId);
        await this.runtime.ensureConnection(
          userId,
          roomId,
          currentTweet.username,
          currentTweet.name,
          "twitter"
        );
        this.runtime.messageManager.createMemory({
          id: stringToUuid3(
            currentTweet.id + "-" + this.runtime.agentId
          ),
          agentId: this.runtime.agentId,
          content: {
            text: currentTweet.text,
            source: "twitter",
            url: currentTweet.permanentUrl,
            imageUrls: ((_a = currentTweet.photos) == null ? void 0 : _a.map((photo) => photo.url)) || [],
            inReplyTo: currentTweet.inReplyToStatusId ? stringToUuid3(
              currentTweet.inReplyToStatusId + "-" + this.runtime.agentId
            ) : void 0
          },
          createdAt: currentTweet.timestamp * 1e3,
          roomId,
          userId: currentTweet.userId === this.twitterUserId ? this.runtime.agentId : stringToUuid3(currentTweet.userId),
          embedding: getEmbeddingZeroVector3()
        });
      }
      if (visited.has(currentTweet.id)) {
        elizaLogger3.log("Already visited tweet:", currentTweet.id);
        return;
      }
      visited.add(currentTweet.id);
      thread.unshift(currentTweet);
      if (currentTweet.inReplyToStatusId) {
        elizaLogger3.log(
          "Fetching parent tweet:",
          currentTweet.inReplyToStatusId
        );
        try {
          const parentTweet = await this.twitterClient.getTweet(
            currentTweet.inReplyToStatusId
          );
          if (parentTweet) {
            elizaLogger3.log("Found parent tweet:", {
              id: parentTweet.id,
              text: (_b = parentTweet.text) == null ? void 0 : _b.slice(0, 50)
            });
            await processThread(parentTweet, depth + 1);
          } else {
            elizaLogger3.log(
              "No parent tweet found for:",
              currentTweet.inReplyToStatusId
            );
          }
        } catch (error) {
          elizaLogger3.log("Error fetching parent tweet:", {
            tweetId: currentTweet.inReplyToStatusId,
            error
          });
        }
      } else {
        elizaLogger3.log(
          "Reached end of reply chain at:",
          currentTweet.id
        );
      }
    }
    await processThread.bind(this)(tweet, 0);
    return thread;
  }
};

// src/post.ts
import {
  composeContext as composeContext2,
  generateText,
  getEmbeddingZeroVector as getEmbeddingZeroVector4,
  ModelClass as ModelClass2,
  stringToUuid as stringToUuid4,
  truncateToCompleteSentence,
  parseJSONObjectFromText,
  extractAttributes,
  cleanJsonResponse
} from "@elizaos/core";
import { elizaLogger as elizaLogger4 } from "@elizaos/core";
import { postActionResponseFooter } from "@elizaos/core";
import { generateTweetActions } from "@elizaos/core";
import { ServiceType as ServiceType2 } from "@elizaos/core";
import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  Partials
} from "discord.js";
var MAX_TIMELINES_TO_FETCH = 15;
var twitterPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should be 1, 2, or 3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. No emojis. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.`;
var twitterActionTemplate = `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[LIKE] - Perfect topic match AND aligns with character (9.8/10)
[RETWEET] - Exceptional content that embodies character's expertise (9.5/10)
[QUOTE] - Can add substantial domain expertise (9.5/10)
[REPLY] - Can contribute meaningful, expert-level insight (9.5/10)

Tweet:
{{currentTweet}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance.` + postActionResponseFooter;
var TwitterPostClient = class {
  client;
  runtime;
  twitterUsername;
  isProcessing = false;
  lastProcessTime = 0;
  stopProcessingActions = false;
  isDryRun;
  discordClientForApproval;
  approvalRequired = false;
  discordApprovalChannelId;
  approvalCheckInterval;
  constructor(client, runtime) {
    var _a;
    this.client = client;
    this.runtime = runtime;
    this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
    this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    elizaLogger4.log("Twitter Client Configuration:");
    elizaLogger4.log(`- Username: ${this.twitterUsername}`);
    elizaLogger4.log(
      `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
    );
    elizaLogger4.log(
      `- Enable Post: ${this.client.twitterConfig.ENABLE_TWITTER_POST_GENERATION ? "enabled" : "disabled"}`
    );
    elizaLogger4.log(
      `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
    );
    elizaLogger4.log(
      `- Action Processing: ${this.client.twitterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`
    );
    elizaLogger4.log(
      `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
    );
    elizaLogger4.log(
      `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
    );
    elizaLogger4.log(
      `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
    );
    const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
    if (targetUsers) {
      elizaLogger4.log(`- Target Users: ${targetUsers}`);
    }
    if (this.isDryRun) {
      elizaLogger4.log(
        "Twitter client initialized in dry run mode - no actual tweets should be posted"
      );
    }
    const approvalRequired = ((_a = this.runtime.getSetting("TWITTER_APPROVAL_ENABLED")) == null ? void 0 : _a.toLocaleLowerCase()) === "true";
    if (approvalRequired) {
      const discordToken = this.runtime.getSetting(
        "TWITTER_APPROVAL_DISCORD_BOT_TOKEN"
      );
      const approvalChannelId = this.runtime.getSetting(
        "TWITTER_APPROVAL_DISCORD_CHANNEL_ID"
      );
      const APPROVAL_CHECK_INTERVAL = Number.parseInt(
        this.runtime.getSetting("TWITTER_APPROVAL_CHECK_INTERVAL")
      ) || 5 * 60 * 1e3;
      this.approvalCheckInterval = APPROVAL_CHECK_INTERVAL;
      if (!discordToken || !approvalChannelId) {
        throw new Error(
          "TWITTER_APPROVAL_DISCORD_BOT_TOKEN and TWITTER_APPROVAL_DISCORD_CHANNEL_ID are required for approval workflow"
        );
      }
      this.approvalRequired = true;
      this.discordApprovalChannelId = approvalChannelId;
      this.setupDiscordClient();
    }
  }
  setupDiscordClient() {
    this.discordClientForApproval = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction]
    });
    this.discordClientForApproval.once(
      Events.ClientReady,
      (readyClient) => {
        elizaLogger4.log(
          `Discord bot is ready as ${readyClient.user.tag}!`
        );
        const invite = `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user.id}&permissions=274877991936&scope=bot`;
        elizaLogger4.log(
          `Use this link to properly invite the Twitter Post Approval Discord bot: ${invite}`
        );
      }
    );
    this.discordClientForApproval.login(
      this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_BOT_TOKEN")
    );
  }
  async start() {
    if (!this.client.profile) {
      await this.client.init();
    }
    const generateNewTweetLoop = async () => {
      const lastPost = await this.runtime.cacheManager.get("twitter/" + this.twitterUsername + "/lastPost");
      const lastPostTimestamp = (lastPost == null ? void 0 : lastPost.timestamp) ?? 0;
      const minMinutes = this.client.twitterConfig.POST_INTERVAL_MIN;
      const maxMinutes = this.client.twitterConfig.POST_INTERVAL_MAX;
      const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
      const delay = randomMinutes * 60 * 1e3;
      if (Date.now() > lastPostTimestamp + delay) {
        await this.generateNewTweet();
      }
      setTimeout(() => {
        generateNewTweetLoop();
      }, delay);
      elizaLogger4.log(`Next tweet scheduled in ${randomMinutes} minutes`);
    };
    const processActionsLoop = async () => {
      const actionInterval = this.client.twitterConfig.ACTION_INTERVAL;
      while (!this.stopProcessingActions) {
        try {
          const results = await this.processTweetActions();
          if (results) {
            elizaLogger4.log(`Processed ${results.length} tweets`);
            elizaLogger4.log(
              `Next action processing scheduled in ${actionInterval} minutes`
            );
            await new Promise(
              (resolve) => setTimeout(resolve, actionInterval * 60 * 1e3)
              // now in minutes
            );
          }
        } catch (error) {
          elizaLogger4.error(
            "Error in action processing loop:",
            error
          );
          await new Promise((resolve) => setTimeout(resolve, 3e4));
        }
      }
    };
    if (this.client.twitterConfig.POST_IMMEDIATELY) {
      await this.generateNewTweet();
    }
    if (this.client.twitterConfig.ENABLE_TWITTER_POST_GENERATION) {
      generateNewTweetLoop();
      elizaLogger4.log("Tweet generation loop started");
    }
    if (this.client.twitterConfig.ENABLE_ACTION_PROCESSING) {
      processActionsLoop().catch((error) => {
        elizaLogger4.error(
          "Fatal error in process actions loop:",
          error
        );
      });
    }
    if (this.approvalRequired) this.runPendingTweetCheckLoop();
  }
  runPendingTweetCheckLoop() {
    setInterval(async () => {
      await this.handlePendingTweet();
    }, this.approvalCheckInterval);
  }
  createTweetObject(tweetResult, client, twitterUsername) {
    return {
      id: tweetResult.rest_id,
      name: client.profile.screenName,
      username: client.profile.username,
      text: tweetResult.legacy.full_text,
      conversationId: tweetResult.legacy.conversation_id_str,
      createdAt: tweetResult.legacy.created_at,
      timestamp: new Date(tweetResult.legacy.created_at).getTime(),
      userId: client.profile.id,
      inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
      permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
      hashtags: [],
      mentions: [],
      photos: [],
      thread: [],
      urls: [],
      videos: []
    };
  }
  async processAndCacheTweet(runtime, client, tweet, roomId, rawTweetContent) {
    await runtime.cacheManager.set(
      `twitter/${client.profile.username}/lastPost`,
      {
        id: tweet.id,
        timestamp: Date.now()
      }
    );
    await client.cacheTweet(tweet);
    elizaLogger4.log(`Tweet posted:
 ${tweet.permanentUrl}`);
    await runtime.ensureRoomExists(roomId);
    await runtime.ensureParticipantInRoom(runtime.agentId, roomId);
    await runtime.messageManager.createMemory({
      id: stringToUuid4(tweet.id + "-" + runtime.agentId),
      userId: runtime.agentId,
      agentId: runtime.agentId,
      content: {
        text: rawTweetContent.trim(),
        url: tweet.permanentUrl,
        source: "twitter"
      },
      roomId,
      embedding: getEmbeddingZeroVector4(),
      createdAt: tweet.timestamp
    });
  }
  async handleNoteTweet(client, content, tweetId, mediaData) {
    try {
      const noteTweetResult = await client.requestQueue.add(
        async () => await client.twitterClient.sendNoteTweet(
          content,
          tweetId,
          mediaData
        )
      );
      if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
        const truncateContent = truncateToCompleteSentence(
          content,
          this.client.twitterConfig.MAX_TWEET_LENGTH
        );
        return await this.sendStandardTweet(
          client,
          truncateContent,
          tweetId
        );
      } else {
        return noteTweetResult.data.notetweet_create.tweet_results.result;
      }
    } catch (error) {
      throw new Error(`Note Tweet failed: ${error}`);
    }
  }
  async sendStandardTweet(client, content, tweetId, mediaData) {
    var _a, _b, _c;
    try {
      const standardTweetResult = await client.requestQueue.add(
        async () => await client.twitterClient.sendTweet(
          content,
          tweetId,
          mediaData
        )
      );
      const body = await standardTweetResult.json();
      if (!((_c = (_b = (_a = body == null ? void 0 : body.data) == null ? void 0 : _a.create_tweet) == null ? void 0 : _b.tweet_results) == null ? void 0 : _c.result)) {
        elizaLogger4.error("Error sending tweet; Bad response:", body);
        return;
      }
      return body.data.create_tweet.tweet_results.result;
    } catch (error) {
      elizaLogger4.error("Error sending standard Tweet:", error);
      throw error;
    }
  }
  async postTweet(runtime, client, tweetTextForPosting, roomId, rawTweetContent, twitterUsername, mediaData) {
    try {
      elizaLogger4.log(`Posting new tweet:
`);
      let result;
      if (tweetTextForPosting.length > DEFAULT_MAX_TWEET_LENGTH) {
        result = await this.handleNoteTweet(
          client,
          tweetTextForPosting,
          void 0,
          mediaData
        );
      } else {
        result = await this.sendStandardTweet(
          client,
          tweetTextForPosting,
          void 0,
          mediaData
        );
      }
      const tweet = this.createTweetObject(
        result,
        client,
        twitterUsername
      );
      await this.processAndCacheTweet(
        runtime,
        client,
        tweet,
        roomId,
        rawTweetContent
      );
    } catch (error) {
      elizaLogger4.error("Error sending tweet:", error);
    }
  }
  /**
   * Generates and posts a new tweet. If isDryRun is true, only logs what would have been posted.
   */
  async generateNewTweet() {
    var _a;
    elizaLogger4.log("Generating new tweet");
    try {
      const roomId = stringToUuid4(
        "twitter_generate_room-" + this.client.profile.username
      );
      await this.runtime.ensureUserExists(
        this.runtime.agentId,
        this.client.profile.username,
        this.runtime.character.name,
        "twitter"
      );
      const topics = this.runtime.character.topics.join(", ");
      const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
      const state = await this.runtime.composeState(
        {
          userId: this.runtime.agentId,
          roomId,
          agentId: this.runtime.agentId,
          content: {
            text: topics || "",
            action: "TWEET"
          }
        },
        {
          twitterUserName: this.client.profile.username,
          maxTweetLength
        }
      );
      const context = composeContext2({
        state,
        template: ((_a = this.runtime.character.templates) == null ? void 0 : _a.twitterPostTemplate) || twitterPostTemplate
      });
      elizaLogger4.debug("generate post prompt:\n" + context);
      const response = await generateText({
        runtime: this.runtime,
        context,
        modelClass: ModelClass2.SMALL
      });
      const rawTweetContent = cleanJsonResponse(response);
      let tweetTextForPosting = null;
      let mediaData = null;
      const parsedResponse = parseJSONObjectFromText(rawTweetContent);
      if (parsedResponse == null ? void 0 : parsedResponse.text) {
        tweetTextForPosting = parsedResponse.text;
      } else {
        tweetTextForPosting = rawTweetContent.trim();
      }
      if ((parsedResponse == null ? void 0 : parsedResponse.attachments) && (parsedResponse == null ? void 0 : parsedResponse.attachments.length) > 0) {
        mediaData = await fetchMediaData(parsedResponse.attachments);
      }
      if (!tweetTextForPosting) {
        const parsingText = extractAttributes(rawTweetContent, [
          "text"
        ]).text;
        if (parsingText) {
          tweetTextForPosting = truncateToCompleteSentence(
            extractAttributes(rawTweetContent, ["text"]).text,
            this.client.twitterConfig.MAX_TWEET_LENGTH
          );
        }
      }
      if (!tweetTextForPosting) {
        tweetTextForPosting = rawTweetContent;
      }
      if (maxTweetLength) {
        tweetTextForPosting = truncateToCompleteSentence(
          tweetTextForPosting,
          maxTweetLength
        );
      }
      const removeQuotes = (str) => str.replace(/^['"](.*)['"]$/, "$1");
      const fixNewLines = (str) => str.replaceAll(/\\n/g, "\n\n");
      tweetTextForPosting = removeQuotes(
        fixNewLines(tweetTextForPosting)
      );
      if (this.isDryRun) {
        elizaLogger4.info(
          `Dry run: would have posted tweet: ${tweetTextForPosting}`
        );
        return;
      }
      try {
        if (this.approvalRequired) {
          elizaLogger4.log(
            `Sending Tweet For Approval:
 ${tweetTextForPosting}`
          );
          await this.sendForApproval(
            tweetTextForPosting,
            roomId,
            rawTweetContent
          );
          elizaLogger4.log("Tweet sent for approval");
        } else {
          elizaLogger4.log(
            `Posting new tweet:
 ${tweetTextForPosting}`
          );
          this.postTweet(
            this.runtime,
            this.client,
            tweetTextForPosting,
            roomId,
            rawTweetContent,
            this.twitterUsername,
            mediaData
          );
        }
      } catch (error) {
        elizaLogger4.error("Error sending tweet:", error);
      }
    } catch (error) {
      elizaLogger4.error("Error generating new tweet:", error);
    }
  }
  async generateTweetContent(tweetState, options) {
    var _a;
    const context = composeContext2({
      state: tweetState,
      template: (options == null ? void 0 : options.template) || ((_a = this.runtime.character.templates) == null ? void 0 : _a.twitterPostTemplate) || twitterPostTemplate
    });
    const response = await generateText({
      runtime: this.runtime,
      context: (options == null ? void 0 : options.context) || context,
      modelClass: ModelClass2.SMALL
    });
    elizaLogger4.log("generate tweet content response:\n" + response);
    const cleanedResponse = cleanJsonResponse(response);
    const jsonResponse = parseJSONObjectFromText(cleanedResponse);
    if (jsonResponse.text) {
      const truncateContent2 = truncateToCompleteSentence(
        jsonResponse.text,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
      return truncateContent2;
    }
    if (typeof jsonResponse === "object") {
      const possibleContent = jsonResponse.content || jsonResponse.message || jsonResponse.response;
      if (possibleContent) {
        const truncateContent2 = truncateToCompleteSentence(
          possibleContent,
          this.client.twitterConfig.MAX_TWEET_LENGTH
        );
        return truncateContent2;
      }
    }
    let truncateContent = null;
    const parsingText = extractAttributes(cleanedResponse, ["text"]).text;
    if (parsingText) {
      truncateContent = truncateToCompleteSentence(
        parsingText,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
    }
    if (!truncateContent) {
      truncateContent = truncateToCompleteSentence(
        cleanedResponse,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
    }
    return truncateContent;
  }
  /**
   * Processes tweet actions (likes, retweets, quotes, replies). If isDryRun is true,
   * only simulates and logs actions without making API calls.
   */
  async processTweetActions() {
    var _a;
    if (this.isProcessing) {
      elizaLogger4.log("Already processing tweet actions, skipping");
      return null;
    }
    try {
      this.isProcessing = true;
      this.lastProcessTime = Date.now();
      elizaLogger4.log("Processing tweet actions");
      await this.runtime.ensureUserExists(
        this.runtime.agentId,
        this.twitterUsername,
        this.runtime.character.name,
        "twitter"
      );
      const timelines = await this.client.fetchTimelineForActions(
        MAX_TIMELINES_TO_FETCH
      );
      const maxActionsProcessing = this.client.twitterConfig.MAX_ACTIONS_PROCESSING;
      const processedTimelines = [];
      for (const tweet of timelines) {
        try {
          const memory = await this.runtime.messageManager.getMemoryById(
            stringToUuid4(tweet.id + "-" + this.runtime.agentId)
          );
          if (memory) {
            elizaLogger4.log(
              `Already processed tweet ID: ${tweet.id}`
            );
            continue;
          }
          const roomId = stringToUuid4(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const tweetState = await this.runtime.composeState(
            {
              userId: this.runtime.agentId,
              roomId,
              agentId: this.runtime.agentId,
              content: { text: "", action: "" }
            },
            {
              twitterUserName: this.twitterUsername,
              currentTweet: `ID: ${tweet.id}
From: ${tweet.name} (@${tweet.username})
Text: ${tweet.text}`
            }
          );
          const actionContext = composeContext2({
            state: tweetState,
            template: ((_a = this.runtime.character.templates) == null ? void 0 : _a.twitterActionTemplate) || twitterActionTemplate
          });
          const actionResponse = await generateTweetActions({
            runtime: this.runtime,
            context: actionContext,
            modelClass: ModelClass2.SMALL
          });
          if (!actionResponse) {
            elizaLogger4.log(
              `No valid actions generated for tweet ${tweet.id}`
            );
            continue;
          }
          processedTimelines.push({
            tweet,
            actionResponse,
            tweetState,
            roomId
          });
        } catch (error) {
          elizaLogger4.error(
            `Error processing tweet ${tweet.id}:`,
            error
          );
          continue;
        }
      }
      const sortProcessedTimeline = (arr) => {
        return arr.sort((a, b) => {
          const countTrue = (obj) => Object.values(obj).filter(Boolean).length;
          const countA = countTrue(a.actionResponse);
          const countB = countTrue(b.actionResponse);
          if (countA !== countB) {
            return countB - countA;
          }
          if (a.actionResponse.like !== b.actionResponse.like) {
            return a.actionResponse.like ? -1 : 1;
          }
          return 0;
        });
      };
      const sortedTimelines = sortProcessedTimeline(
        processedTimelines
      ).slice(0, maxActionsProcessing);
      return this.processTimelineActions(sortedTimelines);
    } catch (error) {
      elizaLogger4.error("Error in processTweetActions:", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }
  /**
   * Processes a list of timelines by executing the corresponding tweet actions.
   * Each timeline includes the tweet, action response, tweet state, and room context.
   * Results are returned for tracking completed actions.
   *
   * @param timelines - Array of objects containing tweet details, action responses, and state information.
   * @returns A promise that resolves to an array of results with details of executed actions.
   */
  async processTimelineActions(timelines) {
    var _a, _b, _c, _d, _e;
    const results = [];
    for (const timeline of timelines) {
      const { actionResponse, tweetState, roomId, tweet } = timeline;
      try {
        const executedActions = [];
        if (actionResponse.like) {
          if (this.isDryRun) {
            elizaLogger4.info(
              `Dry run: would have liked tweet ${tweet.id}`
            );
            executedActions.push("like (dry run)");
          } else {
            try {
              await this.client.twitterClient.likeTweet(tweet.id);
              executedActions.push("like");
              elizaLogger4.log(`Liked tweet ${tweet.id}`);
            } catch (error) {
              elizaLogger4.error(
                `Error liking tweet ${tweet.id}:`,
                error
              );
            }
          }
        }
        if (actionResponse.retweet) {
          if (this.isDryRun) {
            elizaLogger4.info(
              `Dry run: would have retweeted tweet ${tweet.id}`
            );
            executedActions.push("retweet (dry run)");
          } else {
            try {
              await this.client.twitterClient.retweet(tweet.id);
              executedActions.push("retweet");
              elizaLogger4.log(`Retweeted tweet ${tweet.id}`);
            } catch (error) {
              elizaLogger4.error(
                `Error retweeting tweet ${tweet.id}:`,
                error
              );
            }
          }
        }
        if (actionResponse.quote) {
          try {
            const thread = await buildConversationThread(
              tweet,
              this.client
            );
            const formattedConversation = thread.map(
              (t) => `@${t.username} (${new Date(
                t.timestamp * 1e3
              ).toLocaleString()}): ${t.text}`
            ).join("\n\n");
            const imageDescriptions = [];
            if (((_a = tweet.photos) == null ? void 0 : _a.length) > 0) {
              elizaLogger4.log(
                "Processing images in tweet for context"
              );
              for (const photo of tweet.photos) {
                const description = await this.runtime.getService(
                  ServiceType2.IMAGE_DESCRIPTION
                ).describeImage(photo.url);
                imageDescriptions.push(description);
              }
            }
            let quotedContent = "";
            if (tweet.quotedStatusId) {
              try {
                const quotedTweet = await this.client.twitterClient.getTweet(
                  tweet.quotedStatusId
                );
                if (quotedTweet) {
                  quotedContent = `
Quoted Tweet from @${quotedTweet.username}:
${quotedTweet.text}`;
                }
              } catch (error) {
                elizaLogger4.error(
                  "Error fetching quoted tweet:",
                  error
                );
              }
            }
            const enrichedState = await this.runtime.composeState(
              {
                userId: this.runtime.agentId,
                roomId: stringToUuid4(
                  tweet.conversationId + "-" + this.runtime.agentId
                ),
                agentId: this.runtime.agentId,
                content: {
                  text: tweet.text,
                  action: "QUOTE"
                }
              },
              {
                twitterUserName: this.twitterUsername,
                currentPost: `From @${tweet.username}: ${tweet.text}`,
                formattedConversation,
                imageContext: imageDescriptions.length > 0 ? `
Images in Tweet:
${imageDescriptions.map(
                  (desc, i) => `Image ${i + 1}: ${desc}`
                ).join("\n")}` : "",
                quotedContent
              }
            );
            const quoteContent = await this.generateTweetContent(
              enrichedState,
              {
                template: ((_b = this.runtime.character.templates) == null ? void 0 : _b.twitterMessageHandlerTemplate) || twitterMessageHandlerTemplate
              }
            );
            if (!quoteContent) {
              elizaLogger4.error(
                "Failed to generate valid quote tweet content"
              );
              return;
            }
            elizaLogger4.log(
              "Generated quote tweet content:",
              quoteContent
            );
            if (this.isDryRun) {
              elizaLogger4.info(
                `Dry run: A quote tweet for tweet ID ${tweet.id} would have been posted with the following content: "${quoteContent}".`
              );
              executedActions.push("quote (dry run)");
            } else {
              const result = await this.client.requestQueue.add(
                async () => await this.client.twitterClient.sendQuoteTweet(
                  quoteContent,
                  tweet.id
                )
              );
              const body = await result.json();
              if ((_e = (_d = (_c = body == null ? void 0 : body.data) == null ? void 0 : _c.create_tweet) == null ? void 0 : _d.tweet_results) == null ? void 0 : _e.result) {
                elizaLogger4.log(
                  "Successfully posted quote tweet"
                );
                executedActions.push("quote");
                await this.runtime.cacheManager.set(
                  `twitter/quote_generation_${tweet.id}.txt`,
                  `Context:
${enrichedState}

Generated Quote:
${quoteContent}`
                );
              } else {
                elizaLogger4.error(
                  "Quote tweet creation failed:",
                  body
                );
              }
            }
          } catch (error) {
            elizaLogger4.error(
              "Error in quote tweet generation:",
              error
            );
          }
        }
        if (actionResponse.reply) {
          try {
            await this.handleTextOnlyReply(
              tweet,
              tweetState,
              executedActions
            );
          } catch (error) {
            elizaLogger4.error(
              `Error replying to tweet ${tweet.id}:`,
              error
            );
          }
        }
        await this.runtime.ensureRoomExists(roomId);
        await this.runtime.ensureUserExists(
          stringToUuid4(tweet.userId),
          tweet.username,
          tweet.name,
          "twitter"
        );
        await this.runtime.ensureParticipantInRoom(
          this.runtime.agentId,
          roomId
        );
        if (!this.isDryRun) {
          await this.runtime.messageManager.createMemory({
            id: stringToUuid4(tweet.id + "-" + this.runtime.agentId),
            userId: stringToUuid4(tweet.userId),
            content: {
              text: tweet.text,
              url: tweet.permanentUrl,
              source: "twitter",
              action: executedActions.join(",")
            },
            agentId: this.runtime.agentId,
            roomId,
            embedding: getEmbeddingZeroVector4(),
            createdAt: tweet.timestamp * 1e3
          });
        }
        results.push({
          tweetId: tweet.id,
          actionResponse,
          executedActions
        });
      } catch (error) {
        elizaLogger4.error(`Error processing tweet ${tweet.id}:`, error);
        continue;
      }
    }
    return results;
  }
  /**
   * Handles text-only replies to tweets. If isDryRun is true, only logs what would
   * have been replied without making API calls.
   */
  async handleTextOnlyReply(tweet, tweetState, executedActions) {
    var _a, _b;
    try {
      const thread = await buildConversationThread(tweet, this.client);
      const formattedConversation = thread.map(
        (t) => `@${t.username} (${new Date(
          t.timestamp * 1e3
        ).toLocaleString()}): ${t.text}`
      ).join("\n\n");
      const imageDescriptions = [];
      if (((_a = tweet.photos) == null ? void 0 : _a.length) > 0) {
        elizaLogger4.log("Processing images in tweet for context");
        for (const photo of tweet.photos) {
          const description = await this.runtime.getService(
            ServiceType2.IMAGE_DESCRIPTION
          ).describeImage(photo.url);
          imageDescriptions.push(description);
        }
      }
      let quotedContent = "";
      if (tweet.quotedStatusId) {
        try {
          const quotedTweet = await this.client.twitterClient.getTweet(
            tweet.quotedStatusId
          );
          if (quotedTweet) {
            quotedContent = `
Quoted Tweet from @${quotedTweet.username}:
${quotedTweet.text}`;
          }
        } catch (error) {
          elizaLogger4.error("Error fetching quoted tweet:", error);
        }
      }
      const enrichedState = await this.runtime.composeState(
        {
          userId: this.runtime.agentId,
          roomId: stringToUuid4(
            tweet.conversationId + "-" + this.runtime.agentId
          ),
          agentId: this.runtime.agentId,
          content: { text: tweet.text, action: "" }
        },
        {
          twitterUserName: this.twitterUsername,
          currentPost: `From @${tweet.username}: ${tweet.text}`,
          formattedConversation,
          imageContext: imageDescriptions.length > 0 ? `
Images in Tweet:
${imageDescriptions.map((desc, i) => `Image ${i + 1}: ${desc}`).join("\n")}` : "",
          quotedContent
        }
      );
      const replyText = await this.generateTweetContent(enrichedState, {
        template: ((_b = this.runtime.character.templates) == null ? void 0 : _b.twitterMessageHandlerTemplate) || twitterMessageHandlerTemplate
      });
      if (!replyText) {
        elizaLogger4.error("Failed to generate valid reply content");
        return;
      }
      if (this.isDryRun) {
        elizaLogger4.info(
          `Dry run: reply to tweet ${tweet.id} would have been: ${replyText}`
        );
        executedActions.push("reply (dry run)");
        return;
      }
      elizaLogger4.debug("Final reply text to be sent:", replyText);
      let result;
      if (replyText.length > DEFAULT_MAX_TWEET_LENGTH) {
        result = await this.handleNoteTweet(
          this.client,
          replyText,
          tweet.id
        );
      } else {
        result = await this.sendStandardTweet(
          this.client,
          replyText,
          tweet.id
        );
      }
      if (result) {
        elizaLogger4.log("Successfully posted reply tweet");
        executedActions.push("reply");
        await this.runtime.cacheManager.set(
          `twitter/reply_generation_${tweet.id}.txt`,
          `Context:
${enrichedState}

Generated Reply:
${replyText}`
        );
      } else {
        elizaLogger4.error("Tweet reply creation failed");
      }
    } catch (error) {
      elizaLogger4.error("Error in handleTextOnlyReply:", error);
    }
  }
  async stop() {
    this.stopProcessingActions = true;
  }
  async sendForApproval(tweetTextForPosting, roomId, rawTweetContent) {
    try {
      const embed = {
        title: "New Tweet Pending Approval",
        description: tweetTextForPosting,
        fields: [
          {
            name: "Character",
            value: this.client.profile.username,
            inline: true
          },
          {
            name: "Length",
            value: tweetTextForPosting.length.toString(),
            inline: true
          }
        ],
        footer: {
          text: "Reply with '\u{1F44D}' to post or '\u274C' to discard, This will automatically expire and remove after 24 hours if no response received"
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const channel = await this.discordClientForApproval.channels.fetch(
        this.discordApprovalChannelId
      );
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error("Invalid approval channel");
      }
      const message = await channel.send({ embeds: [embed] });
      const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
      const currentPendingTweets = await this.runtime.cacheManager.get(
        pendingTweetsKey
      ) || [];
      currentPendingTweets.push({
        tweetTextForPosting,
        roomId,
        rawTweetContent,
        discordMessageId: message.id,
        channelId: this.discordApprovalChannelId,
        timestamp: Date.now()
      });
      await this.runtime.cacheManager.set(
        pendingTweetsKey,
        currentPendingTweets
      );
      return message.id;
    } catch (error) {
      elizaLogger4.error(
        "Error Sending Twitter Post Approval Request:",
        error
      );
      return null;
    }
  }
  async checkApprovalStatus(discordMessageId) {
    try {
      const channel = await this.discordClientForApproval.channels.fetch(
        this.discordApprovalChannelId
      );
      elizaLogger4.log(`channel ${JSON.stringify(channel)}`);
      if (!(channel instanceof TextChannel)) {
        elizaLogger4.error("Invalid approval channel");
        return "PENDING";
      }
      const message = await channel.messages.fetch(discordMessageId);
      const thumbsUpReaction = message.reactions.cache.find(
        (reaction) => reaction.emoji.name === "\u{1F44D}"
      );
      const rejectReaction = message.reactions.cache.find(
        (reaction) => reaction.emoji.name === "\u274C"
      );
      if (rejectReaction) {
        const count = rejectReaction.count;
        if (count > 0) {
          return "REJECTED";
        }
      }
      if (thumbsUpReaction) {
        const count = thumbsUpReaction.count;
        if (count > 0) {
          return "APPROVED";
        }
      }
      return "PENDING";
    } catch (error) {
      elizaLogger4.error("Error checking approval status:", error);
      return "PENDING";
    }
  }
  async cleanupPendingTweet(discordMessageId) {
    const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
    const currentPendingTweets = await this.runtime.cacheManager.get(
      pendingTweetsKey
    ) || [];
    const updatedPendingTweets = currentPendingTweets.filter(
      (tweet) => tweet.discordMessageId !== discordMessageId
    );
    if (updatedPendingTweets.length === 0) {
      await this.runtime.cacheManager.delete(pendingTweetsKey);
    } else {
      await this.runtime.cacheManager.set(
        pendingTweetsKey,
        updatedPendingTweets
      );
    }
  }
  async handlePendingTweet() {
    elizaLogger4.log("Checking Pending Tweets...");
    const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
    const pendingTweets = await this.runtime.cacheManager.get(
      pendingTweetsKey
    ) || [];
    for (const pendingTweet of pendingTweets) {
      const isExpired = Date.now() - pendingTweet.timestamp > 24 * 60 * 60 * 1e3;
      if (isExpired) {
        elizaLogger4.log("Pending tweet expired, cleaning up");
        try {
          const channel = await this.discordClientForApproval.channels.fetch(
            pendingTweet.channelId
          );
          if (channel instanceof TextChannel) {
            const originalMessage = await channel.messages.fetch(
              pendingTweet.discordMessageId
            );
            await originalMessage.reply(
              "This tweet approval request has expired (24h timeout)."
            );
          }
        } catch (error) {
          elizaLogger4.error(
            "Error sending expiration notification:",
            error
          );
        }
        await this.cleanupPendingTweet(pendingTweet.discordMessageId);
        return;
      }
      elizaLogger4.log("Checking approval status...");
      const approvalStatus = await this.checkApprovalStatus(pendingTweet.discordMessageId);
      if (approvalStatus === "APPROVED") {
        elizaLogger4.log("Tweet Approved, Posting");
        await this.postTweet(
          this.runtime,
          this.client,
          pendingTweet.tweetTextForPosting,
          pendingTweet.roomId,
          pendingTweet.rawTweetContent,
          this.twitterUsername
        );
        try {
          const channel = await this.discordClientForApproval.channels.fetch(
            pendingTweet.channelId
          );
          if (channel instanceof TextChannel) {
            const originalMessage = await channel.messages.fetch(
              pendingTweet.discordMessageId
            );
            await originalMessage.reply(
              "Tweet has been posted successfully! \u2705"
            );
          }
        } catch (error) {
          elizaLogger4.error(
            "Error sending post notification:",
            error
          );
        }
        await this.cleanupPendingTweet(pendingTweet.discordMessageId);
      } else if (approvalStatus === "REJECTED") {
        elizaLogger4.log("Tweet Rejected, Cleaning Up");
        await this.cleanupPendingTweet(pendingTweet.discordMessageId);
        try {
          const channel = await this.discordClientForApproval.channels.fetch(
            pendingTweet.channelId
          );
          if (channel instanceof TextChannel) {
            const originalMessage = await channel.messages.fetch(
              pendingTweet.discordMessageId
            );
            await originalMessage.reply(
              "Tweet has been rejected! \u274C"
            );
          }
        } catch (error) {
          elizaLogger4.error(
            "Error sending rejection notification:",
            error
          );
        }
      }
    }
  }
};

// src/search.ts
import { SearchMode as SearchMode3 } from "agent-twitter-client";
import { composeContext as composeContext3, elizaLogger as elizaLogger5 } from "@elizaos/core";
import { generateMessageResponse as generateMessageResponse2, generateText as generateText2 } from "@elizaos/core";
import { messageCompletionFooter as messageCompletionFooter2 } from "@elizaos/core";
import {
  ModelClass as ModelClass3,
  ServiceType as ServiceType3
} from "@elizaos/core";
import { stringToUuid as stringToUuid5 } from "@elizaos/core";
var twitterSearchTemplate = `{{timeline}}

{{providers}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{postDirections}}

{{recentPosts}}

# Task: Respond to the following post in the style and perspective of {{agentName}} (aka @{{twitterUserName}}). Write a {{adjective}} response for {{agentName}} to say directly in response to the post. don't generalize.
{{currentPost}}

IMPORTANT: Your response CANNOT be longer than 20 words.
Aim for 1-2 short sentences maximum. Be concise and direct.

Your response should not contain any questions. Brief, concise statements only. No emojis. Use \\n\\n (double spaces) between statements.

` + messageCompletionFooter2;
var TwitterSearchClient = class {
  client;
  runtime;
  twitterUsername;
  respondedTweets = /* @__PURE__ */ new Set();
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
    this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
  }
  async start() {
    this.engageWithSearchTermsLoop();
  }
  engageWithSearchTermsLoop() {
    this.engageWithSearchTerms().then();
    const randomMinutes = Math.floor(Math.random() * (120 - 60 + 1)) + 60;
    elizaLogger5.log(
      `Next twitter search scheduled in ${randomMinutes} minutes`
    );
    setTimeout(
      () => this.engageWithSearchTermsLoop(),
      randomMinutes * 60 * 1e3
    );
  }
  async engageWithSearchTerms() {
    var _a;
    elizaLogger5.log("Engaging with search terms");
    try {
      const searchTerm = [...this.runtime.character.topics][Math.floor(Math.random() * this.runtime.character.topics.length)];
      elizaLogger5.log("Fetching search tweets");
      await new Promise((resolve) => setTimeout(resolve, 5e3));
      const recentTweets = await this.client.fetchSearchTweets(
        searchTerm,
        20,
        SearchMode3.Top
      );
      elizaLogger5.log("Search tweets fetched");
      const homeTimeline = await this.client.fetchHomeTimeline(50);
      await this.client.cacheTimeline(homeTimeline);
      const formattedHomeTimeline = `# ${this.runtime.character.name}'s Home Timeline

` + homeTimeline.map((tweet) => {
        return `ID: ${tweet.id}
From: ${tweet.name} (@${tweet.username})${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}
Text: ${tweet.text}
---
`;
      }).join("\n");
      const slicedTweets = recentTweets.tweets.sort(() => Math.random() - 0.5).slice(0, 20);
      if (slicedTweets.length === 0) {
        elizaLogger5.log(
          "No valid tweets found for the search term",
          searchTerm
        );
        return;
      }
      const prompt = `
  Here are some tweets related to the search term "${searchTerm}":

  ${[...slicedTweets, ...homeTimeline].filter((tweet) => {
        const thread = tweet.thread;
        const botTweet = thread.find(
          (t) => t.username === this.twitterUsername
        );
        return !botTweet;
      }).map(
        (tweet) => `
    ID: ${tweet.id}${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}
    From: ${tweet.name} (@${tweet.username})
    Text: ${tweet.text}
  `
      ).join("\n")}

  Which tweet is the most interesting and relevant for Ruby to reply to? Please provide only the ID of the tweet in your response.
  Notes:
    - Respond to English tweets only
    - Respond to tweets that don't have a lot of hashtags, links, URLs or images
    - Respond to tweets that are not retweets
    - Respond to tweets where there is an easy exchange of ideas to have with the user
    - ONLY respond with the ID of the tweet`;
      const mostInterestingTweetResponse = await generateText2({
        runtime: this.runtime,
        context: prompt,
        modelClass: ModelClass3.SMALL
      });
      const tweetId = mostInterestingTweetResponse.trim();
      const selectedTweet = slicedTweets.find(
        (tweet) => tweet.id.toString().includes(tweetId) || tweetId.includes(tweet.id.toString())
      );
      if (!selectedTweet) {
        elizaLogger5.warn("No matching tweet found for the selected ID");
        elizaLogger5.log("Selected tweet ID:", tweetId);
        return;
      }
      elizaLogger5.log("Selected tweet to reply to:", selectedTweet == null ? void 0 : selectedTweet.text);
      if (selectedTweet.username === this.twitterUsername) {
        elizaLogger5.log("Skipping tweet from bot itself");
        return;
      }
      const conversationId = selectedTweet.conversationId;
      const roomId = stringToUuid5(
        conversationId + "-" + this.runtime.agentId
      );
      const userIdUUID = stringToUuid5(selectedTweet.userId);
      await this.runtime.ensureConnection(
        userIdUUID,
        roomId,
        selectedTweet.username,
        selectedTweet.name,
        "twitter"
      );
      await buildConversationThread(selectedTweet, this.client);
      const message = {
        id: stringToUuid5(selectedTweet.id + "-" + this.runtime.agentId),
        agentId: this.runtime.agentId,
        content: {
          text: selectedTweet.text,
          url: selectedTweet.permanentUrl,
          inReplyTo: selectedTweet.inReplyToStatusId ? stringToUuid5(
            selectedTweet.inReplyToStatusId + "-" + this.runtime.agentId
          ) : void 0
        },
        userId: userIdUUID,
        roomId,
        // Timestamps are in seconds, but we need them in milliseconds
        createdAt: selectedTweet.timestamp * 1e3
      };
      if (!message.content.text) {
        elizaLogger5.warn("Returning: No response text found");
        return;
      }
      const replies = selectedTweet.thread;
      const replyContext = replies.filter((reply) => reply.username !== this.twitterUsername).map((reply) => `@${reply.username}: ${reply.text}`).join("\n");
      let tweetBackground = "";
      if (selectedTweet.isRetweet) {
        const originalTweet = await this.client.requestQueue.add(
          () => this.client.twitterClient.getTweet(selectedTweet.id)
        );
        tweetBackground = `Retweeting @${originalTweet.username}: ${originalTweet.text}`;
      }
      const imageDescriptions = [];
      for (const photo of selectedTweet.photos) {
        const description = await this.runtime.getService(
          ServiceType3.IMAGE_DESCRIPTION
        ).describeImage(photo.url);
        imageDescriptions.push(description);
      }
      let state = await this.runtime.composeState(message, {
        twitterClient: this.client.twitterClient,
        twitterUserName: this.twitterUsername,
        timeline: formattedHomeTimeline,
        tweetContext: `${tweetBackground}

  Original Post:
  By @${selectedTweet.username}
  ${selectedTweet.text}${replyContext.length > 0 && `
Replies to original post:
${replyContext}`}
  ${`Original post text: ${selectedTweet.text}`}
  ${selectedTweet.urls.length > 0 ? `URLs: ${selectedTweet.urls.join(", ")}
` : ""}${imageDescriptions.length > 0 ? `
Images in Post (Described): ${imageDescriptions.join(", ")}
` : ""}
  `
      });
      await this.client.saveRequestMessage(message, state);
      const context = composeContext3({
        state,
        template: ((_a = this.runtime.character.templates) == null ? void 0 : _a.twitterSearchTemplate) || twitterSearchTemplate
      });
      const responseContent = await generateMessageResponse2({
        runtime: this.runtime,
        context,
        modelClass: ModelClass3.LARGE
      });
      responseContent.inReplyTo = message.id;
      const response = responseContent;
      if (!response.text) {
        elizaLogger5.warn("Returning: No response text found");
        return;
      }
      elizaLogger5.log(
        `Bot would respond to tweet ${selectedTweet.id} with: ${response.text}`
      );
      try {
        const callback = async (response2) => {
          const memories = await sendTweet(
            this.client,
            response2,
            message.roomId,
            this.twitterUsername,
            selectedTweet.id
          );
          return memories;
        };
        const responseMessages = await callback(responseContent);
        state = await this.runtime.updateRecentMessageState(state);
        for (const responseMessage of responseMessages) {
          await this.runtime.messageManager.createMemory(
            responseMessage,
            false
          );
        }
        state = await this.runtime.updateRecentMessageState(state);
        await this.runtime.evaluate(message, state);
        await this.runtime.processActions(
          message,
          responseMessages,
          state,
          callback
        );
        this.respondedTweets.add(selectedTweet.id);
        const responseInfo = `Context:

${context}

Selected Post: ${selectedTweet.id} - ${selectedTweet.username}: ${selectedTweet.text}
Agent's Output:
${response.text}`;
        await this.runtime.cacheManager.set(
          `twitter/tweet_generation_${selectedTweet.id}.txt`,
          responseInfo
        );
        await wait();
      } catch (error) {
        console.error(`Error sending response post: ${error}`);
      }
    } catch (error) {
      console.error("Error engaging with search terms:", error);
    }
  }
};

// src/spaces.ts
import {
  elizaLogger as elizaLogger7,
  composeContext as composeContext5,
  generateText as generateText3,
  ModelClass as ModelClass5,
  ServiceType as ServiceType4
} from "@elizaos/core";
import {
  Space,
  RecordToDiskPlugin,
  IdleMonitorPlugin
} from "agent-twitter-client";

// src/plugins/SttTtsSpacesPlugin.ts
import { spawn } from "child_process";
import {
  elizaLogger as elizaLogger6,
  stringToUuid as stringToUuid6,
  composeContext as composeContext4,
  getEmbeddingZeroVector as getEmbeddingZeroVector5,
  generateMessageResponse as generateMessageResponse3,
  ModelClass as ModelClass4,
  composeRandomUser,
  generateShouldRespond as generateShouldRespond2
} from "@elizaos/core";

// src/plugins/templates.ts
import { messageCompletionFooter as messageCompletionFooter3, shouldRespondFooter as shouldRespondFooter2 } from "@elizaos/core";
var twitterShouldRespondTemplate2 = `# Task: Decide if {{agentName}} should respond.
About {{agentName}}:
{{bio}}

# INSTRUCTIONS: Determine if {{agentName}} should respond to the message and participate in the conversation. Do not comment. Just respond with "RESPOND" or "IGNORE" or "STOP".

# RESPONSE EXAMPLES
{{user1}}: I just saw a really great movie
{{user2}}: Oh? Which movie?
Result: [IGNORE]

{{agentName}}: Oh, this is my favorite scene
{{user1}}: sick
{{user2}}: wait, why is it your favorite scene
Result: [RESPOND]

{{user1}}: stfu bot
Result: [STOP]

{{user1}}: Hey {{agent}}, can you help me with something
Result: [RESPOND]

{{user1}}: {{agentName}} stfu plz
Result: [STOP]

{{user1}}: i need help
{{agentName}}: how can I help you?
{{user1}}: no. i need help from someone else
Result: [IGNORE]

{{user1}}: Hey {{agent}}, can I ask you a question
{{agentName}}: Sure, what is it
{{user1}}: can you ask claude to create a basic react module that demonstrates a counter
Result: [RESPOND]

{{user1}}: {{agentName}} can you tell me a story
{{user1}}: about a girl named elara
{{agentName}}: Sure.
{{agentName}}: Once upon a time, in a quaint little village, there was a curious girl named Elara.
{{agentName}}: Elara was known for her adventurous spirit and her knack for finding beauty in the mundane.
{{user1}}: I'm loving it, keep going
Result: [RESPOND]

{{user1}}: {{agentName}} stop responding plz
Result: [STOP]

{{user1}}: okay, i want to test something. can you say marco?
{{agentName}}: marco
{{user1}}: great. okay, now do it again
Result: [RESPOND]

Response options are [RESPOND], [IGNORE] and [STOP].

{{agentName}} is in a room with other users and is very worried about being annoying and saying too much.
Respond with [RESPOND] to messages that are directed at {{agentName}}, or participate in conversations that are interesting or relevant to their background.
If a message is not interesting or relevant, respond with [IGNORE]
Unless directly responding to a user, respond with [IGNORE] to messages that are very short or do not contain much information.
If a user asks {{agentName}} to be quiet, respond with [STOP]
If {{agentName}} concludes a conversation and isn't part of the conversation anymore, respond with [STOP]

IMPORTANT: {{agentName}} is particularly sensitive about being annoying, so if there is any doubt, it is better to respond with [IGNORE].
If {{agentName}} is conversing with a user and they have not asked to stop, it is better to respond with [RESPOND].

{{recentMessages}}

# INSTRUCTIONS: Choose the option that best describes {{agentName}}'s response to the last message. Ignore messages if they are addressed to someone else.
` + shouldRespondFooter2;
var twitterVoiceHandlerTemplate = `# Task: Generate conversational voice dialog for {{agentName}}.
    About {{agentName}}:
    {{bio}}

    # Attachments
    {{attachments}}

    # Capabilities
    Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

    {{actions}}

    {{messageDirections}}

    {{recentMessages}}

    # Instructions: Write the next message for {{agentName}}. Include an optional action if appropriate. {{actionNames}}
    ` + messageCompletionFooter3;

// src/plugins/SttTtsSpacesPlugin.ts
var VOLUME_WINDOW_SIZE = 100;
var SPEAKING_THRESHOLD = 0.05;
var SILENCE_DETECTION_THRESHOLD_MS = 1e3;
var SttTtsPlugin = class {
  name = "SttTtsPlugin";
  description = "Speech-to-text (OpenAI) + conversation + TTS (ElevenLabs)";
  runtime;
  client;
  spaceId;
  space;
  janus;
  elevenLabsApiKey;
  voiceId = "21m00Tcm4TlvDq8ikWAM";
  elevenLabsModel = "eleven_monolingual_v1";
  chatContext = [];
  transcriptionService;
  /**
   * userId => arrayOfChunks (PCM Int16)
   */
  pcmBuffers = /* @__PURE__ */ new Map();
  /**
   * For ignoring near-silence frames (if amplitude < threshold)
   */
  silenceThreshold = 50;
  // TTS queue for sequentially speaking
  ttsQueue = [];
  isSpeaking = false;
  isProcessingAudio = false;
  userSpeakingTimer = null;
  volumeBuffers;
  ttsAbortController = null;
  onAttach(_space) {
    elizaLogger6.log("[SttTtsPlugin] onAttach => space was attached");
  }
  init(params) {
    var _a;
    elizaLogger6.log(
      "[SttTtsPlugin] init => Space fully ready. Subscribing to events."
    );
    this.space = params.space;
    this.janus = (_a = this.space) == null ? void 0 : _a.janusClient;
    const config = params.pluginConfig;
    this.runtime = config == null ? void 0 : config.runtime;
    this.client = config == null ? void 0 : config.client;
    this.spaceId = config == null ? void 0 : config.spaceId;
    this.elevenLabsApiKey = config == null ? void 0 : config.elevenLabsApiKey;
    this.transcriptionService = config.transcriptionService;
    if (typeof (config == null ? void 0 : config.silenceThreshold) === "number") {
      this.silenceThreshold = config.silenceThreshold;
    }
    if (config == null ? void 0 : config.voiceId) {
      this.voiceId = config.voiceId;
    }
    if (config == null ? void 0 : config.elevenLabsModel) {
      this.elevenLabsModel = config.elevenLabsModel;
    }
    if (config == null ? void 0 : config.chatContext) {
      this.chatContext = config.chatContext;
    }
    this.volumeBuffers = /* @__PURE__ */ new Map();
  }
  /**
   * Called whenever we receive PCM from a speaker
   */
  onAudioData(data) {
    if (this.isProcessingAudio) {
      return;
    }
    let maxVal = 0;
    for (let i = 0; i < data.samples.length; i++) {
      const val = Math.abs(data.samples[i]);
      if (val > maxVal) maxVal = val;
    }
    if (maxVal < this.silenceThreshold) {
      return;
    }
    if (this.userSpeakingTimer) {
      clearTimeout(this.userSpeakingTimer);
    }
    let arr = this.pcmBuffers.get(data.userId);
    if (!arr) {
      arr = [];
      this.pcmBuffers.set(data.userId, arr);
    }
    arr.push(data.samples);
    if (!this.isSpeaking) {
      this.userSpeakingTimer = setTimeout(() => {
        elizaLogger6.log(
          "[SttTtsPlugin] start processing audio for user =>",
          data.userId
        );
        this.userSpeakingTimer = null;
        this.processAudio(data.userId).catch(
          (err) => elizaLogger6.error(
            "[SttTtsPlugin] handleSilence error =>",
            err
          )
        );
      }, SILENCE_DETECTION_THRESHOLD_MS);
    } else {
      let volumeBuffer = this.volumeBuffers.get(data.userId);
      if (!volumeBuffer) {
        volumeBuffer = [];
        this.volumeBuffers.set(data.userId, volumeBuffer);
      }
      const samples = new Int16Array(
        data.samples.buffer,
        data.samples.byteOffset,
        data.samples.length / 2
      );
      const maxAmplitude = Math.max(...samples.map(Math.abs)) / 32768;
      volumeBuffer.push(maxAmplitude);
      if (volumeBuffer.length > VOLUME_WINDOW_SIZE) {
        volumeBuffer.shift();
      }
      const avgVolume = volumeBuffer.reduce((sum, v) => sum + v, 0) / VOLUME_WINDOW_SIZE;
      if (avgVolume > SPEAKING_THRESHOLD) {
        volumeBuffer.length = 0;
        if (this.ttsAbortController) {
          this.ttsAbortController.abort();
          this.isSpeaking = false;
          elizaLogger6.log("[SttTtsPlugin] TTS playback interrupted");
        }
      }
    }
  }
  // /src/sttTtsPlugin.ts
  async convertPcmToWavInMemory(pcmData, sampleRate) {
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = pcmData.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
      view.setInt16(offset, pcmData[i], true);
    }
    return buffer;
  }
  writeString(view, offset, text) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }
  /**
   * On speaker silence => flush STT => GPT => TTS => push to Janus
   */
  async processAudio(userId) {
    if (this.isProcessingAudio) {
      return;
    }
    this.isProcessingAudio = true;
    try {
      elizaLogger6.log(
        "[SttTtsPlugin] Starting audio processing for user:",
        userId
      );
      const chunks = this.pcmBuffers.get(userId) || [];
      this.pcmBuffers.clear();
      if (!chunks.length) {
        elizaLogger6.warn(
          "[SttTtsPlugin] No audio chunks for user =>",
          userId
        );
        return;
      }
      elizaLogger6.log(
        `[SttTtsPlugin] Flushing STT buffer for user=${userId}, chunks=${chunks.length}`
      );
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Int16Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const wavBuffer = await this.convertPcmToWavInMemory(merged, 48e3);
      const sttText = await this.transcriptionService.transcribe(wavBuffer);
      elizaLogger6.log(
        `[SttTtsPlugin] Transcription result: "${sttText}"`
      );
      if (!sttText || !sttText.trim()) {
        elizaLogger6.warn(
          "[SttTtsPlugin] No speech recognized for user =>",
          userId
        );
        return;
      }
      elizaLogger6.log(
        `[SttTtsPlugin] STT => user=${userId}, text="${sttText}"`
      );
      const replyText = await this.handleUserMessage(sttText, userId);
      if (!replyText || !replyText.length || !replyText.trim()) {
        elizaLogger6.warn(
          "[SttTtsPlugin] No replyText for user =>",
          userId
        );
        return;
      }
      elizaLogger6.log(
        `[SttTtsPlugin] user=${userId}, reply="${replyText}"`
      );
      this.isProcessingAudio = false;
      this.volumeBuffers.clear();
      await this.speakText(replyText);
    } catch (error) {
      elizaLogger6.error("[SttTtsPlugin] processAudio error =>", error);
    } finally {
      this.isProcessingAudio = false;
    }
  }
  /**
   * Public method to queue a TTS request
   */
  async speakText(text) {
    this.ttsQueue.push(text);
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.processTtsQueue().catch((err) => {
        elizaLogger6.error(
          "[SttTtsPlugin] processTtsQueue error =>",
          err
        );
      });
    }
  }
  /**
   * Process TTS requests one by one
   */
  async processTtsQueue() {
    while (this.ttsQueue.length > 0) {
      const text = this.ttsQueue.shift();
      if (!text) continue;
      this.ttsAbortController = new AbortController();
      const { signal } = this.ttsAbortController;
      try {
        const ttsAudio = await this.elevenLabsTts(text);
        const pcm = await this.convertMp3ToPcm(ttsAudio, 48e3);
        if (signal.aborted) {
          elizaLogger6.log(
            "[SttTtsPlugin] TTS interrupted before streaming"
          );
          return;
        }
        await this.streamToJanus(pcm, 48e3);
        if (signal.aborted) {
          elizaLogger6.log(
            "[SttTtsPlugin] TTS interrupted after streaming"
          );
          return;
        }
      } catch (err) {
        elizaLogger6.error("[SttTtsPlugin] TTS streaming error =>", err);
      } finally {
        this.ttsAbortController = null;
      }
    }
    this.isSpeaking = false;
  }
  /**
   * Handle User Message
   */
  async handleUserMessage(userText, userId) {
    var _a, _b, _c;
    const numericId = userId.replace("tw-", "");
    const roomId = stringToUuid6(`twitter_generate_room-${this.spaceId}`);
    const userUuid = stringToUuid6(`twitter-user-${numericId}`);
    await this.runtime.ensureUserExists(
      userUuid,
      userId,
      // Use full Twitter ID as username
      `Twitter User ${numericId}`,
      "twitter"
    );
    await this.runtime.ensureRoomExists(roomId);
    await this.runtime.ensureParticipantInRoom(userUuid, roomId);
    let state = await this.runtime.composeState(
      {
        agentId: this.runtime.agentId,
        content: { text: userText, source: "twitter" },
        userId: userUuid,
        roomId
      },
      {
        twitterUserName: this.client.profile.username,
        agentName: this.runtime.character.name
      }
    );
    const memory = {
      id: stringToUuid6(`${roomId}-voice-message-${Date.now()}`),
      agentId: this.runtime.agentId,
      content: {
        text: userText,
        source: "twitter"
      },
      userId: userUuid,
      roomId,
      embedding: getEmbeddingZeroVector5(),
      createdAt: Date.now()
    };
    await this.runtime.messageManager.createMemory(memory);
    state = await this.runtime.updateRecentMessageState(state);
    const shouldIgnore = await this._shouldIgnore(memory);
    if (shouldIgnore) {
      return "";
    }
    const shouldRespond = await this._shouldRespond(userText, state);
    if (!shouldRespond) {
      return "";
    }
    const context = composeContext4({
      state,
      template: ((_a = this.runtime.character.templates) == null ? void 0 : _a.twitterVoiceHandlerTemplate) || ((_b = this.runtime.character.templates) == null ? void 0 : _b.messageHandlerTemplate) || twitterVoiceHandlerTemplate
    });
    const responseContent = await this._generateResponse(memory, context);
    const responseMemory = {
      id: stringToUuid6(`${memory.id}-voice-response-${Date.now()}`),
      agentId: this.runtime.agentId,
      userId: this.runtime.agentId,
      content: {
        ...responseContent,
        user: this.runtime.character.name,
        inReplyTo: memory.id
      },
      roomId,
      embedding: getEmbeddingZeroVector5()
    };
    const reply = (_c = responseMemory.content.text) == null ? void 0 : _c.trim();
    if (reply) {
      await this.runtime.messageManager.createMemory(responseMemory);
    }
    return reply;
  }
  async _generateResponse(message, context) {
    const { userId, roomId } = message;
    const response = await generateMessageResponse3({
      runtime: this.runtime,
      context,
      modelClass: ModelClass4.SMALL
    });
    response.source = "discord";
    if (!response) {
      elizaLogger6.error(
        "[SttTtsPlugin] No response from generateMessageResponse"
      );
      return;
    }
    await this.runtime.databaseAdapter.log({
      body: { message, context, response },
      userId,
      roomId,
      type: "response"
    });
    return response;
  }
  async _shouldIgnore(message) {
    var _a;
    elizaLogger6.debug("message.content: ", message.content);
    if (message.content.text.length < 3) {
      return true;
    }
    const loseInterestWords = [
      // telling the bot to stop talking
      "shut up",
      "stop",
      "dont talk",
      "silence",
      "stop talking",
      "be quiet",
      "hush",
      "stfu",
      "stupid bot",
      "dumb bot",
      // offensive words
      "fuck",
      "shit",
      "damn",
      "suck",
      "dick",
      "cock",
      "sex",
      "sexy"
    ];
    if (message.content.text.length < 50 && loseInterestWords.some(
      (word) => {
        var _a2;
        return (_a2 = message.content.text) == null ? void 0 : _a2.toLowerCase().includes(word);
      }
    )) {
      return true;
    }
    const ignoreWords = ["k", "ok", "bye", "lol", "nm", "uh"];
    if (((_a = message.content.text) == null ? void 0 : _a.length) < 8 && ignoreWords.some(
      (word) => {
        var _a2;
        return (_a2 = message.content.text) == null ? void 0 : _a2.toLowerCase().includes(word);
      }
    )) {
      return true;
    }
    return false;
  }
  async _shouldRespond(message, state) {
    var _a, _b;
    const lowerMessage = message.toLowerCase();
    const characterName = this.runtime.character.name.toLowerCase();
    if (lowerMessage.includes(characterName)) {
      return true;
    }
    const shouldRespondContext = composeContext4({
      state,
      template: ((_a = this.runtime.character.templates) == null ? void 0 : _a.twitterShouldRespondTemplate) || ((_b = this.runtime.character.templates) == null ? void 0 : _b.shouldRespondTemplate) || composeRandomUser(twitterShouldRespondTemplate2, 2)
    });
    const response = await generateShouldRespond2({
      runtime: this.runtime,
      context: shouldRespondContext,
      modelClass: ModelClass4.SMALL
    });
    if (response === "RESPOND") {
      return true;
    }
    if (response === "IGNORE" || response === "STOP") {
      return false;
    }
    elizaLogger6.error(
      "Invalid response from response generateText:",
      response
    );
    return false;
  }
  /**
   * ElevenLabs TTS => returns MP3 Buffer
   */
  async elevenLabsTts(text) {
    if (!this.elevenLabsApiKey) {
      throw new Error("[SttTtsPlugin] No ElevenLabs API key");
    }
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": this.elevenLabsApiKey
      },
      body: JSON.stringify({
        text,
        model_id: this.elevenLabsModel,
        voice_settings: { stability: 0.4, similarity_boost: 0.8 }
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `[SttTtsPlugin] ElevenLabs TTS error => ${resp.status} ${errText}`
      );
    }
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
  /**
   * Convert MP3 => PCM via ffmpeg
   */
  convertMp3ToPcm(mp3Buf, outRate) {
    return new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-ar",
        outRate.toString(),
        "-ac",
        "1",
        "pipe:1"
      ]);
      let raw = Buffer.alloc(0);
      ff.stdout.on("data", (chunk) => {
        raw = Buffer.concat([raw, chunk]);
      });
      ff.stderr.on("data", () => {
      });
      ff.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg error code=${code}`));
          return;
        }
        const samples = new Int16Array(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength / 2
        );
        resolve(samples);
      });
      ff.stdin.write(mp3Buf);
      ff.stdin.end();
    });
  }
  /**
   * Push PCM back to Janus in small frames
   * We'll do 10ms @48k => 960 samples per frame
   */
  async streamToJanus(samples, sampleRate) {
    var _a, _b;
    const FRAME_SIZE = Math.floor(sampleRate * 0.01);
    for (let offset = 0; offset + FRAME_SIZE <= samples.length; offset += FRAME_SIZE) {
      if ((_a = this.ttsAbortController) == null ? void 0 : _a.signal.aborted) {
        elizaLogger6.log("[SttTtsPlugin] streamToJanus interrupted");
        return;
      }
      const frame = new Int16Array(FRAME_SIZE);
      frame.set(samples.subarray(offset, offset + FRAME_SIZE));
      (_b = this.janus) == null ? void 0 : _b.pushLocalAudio(frame, sampleRate, 1);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  /**
   * Add a message (system, user or assistant) to the chat context.
   * E.g. to store conversation history or inject a persona.
   */
  addMessage(role, content) {
    this.chatContext.push({ role, content });
    elizaLogger6.log(
      `[SttTtsPlugin] addMessage => role=${role}, content=${content}`
    );
  }
  /**
   * Clear the chat context if needed.
   */
  clearChatContext() {
    this.chatContext = [];
    elizaLogger6.log("[SttTtsPlugin] clearChatContext => done");
  }
  cleanup() {
    elizaLogger6.log("[SttTtsPlugin] cleanup => releasing resources");
    this.pcmBuffers.clear();
    this.userSpeakingTimer = null;
    this.ttsQueue = [];
    this.isSpeaking = false;
    this.volumeBuffers.clear();
  }
};

// src/spaces.ts
async function generateFiller(runtime, fillerType) {
  try {
    const context = composeContext5({
      state: { fillerType },
      template: `
# INSTRUCTIONS:
You are generating a short filler message for a Twitter Space. The filler type is "{{fillerType}}".
Keep it brief, friendly, and relevant. No more than two sentences.
Only return the text, no additional formatting.

---
`
    });
    const output = await generateText3({
      runtime,
      context,
      modelClass: ModelClass5.SMALL
    });
    return output.trim();
  } catch (err) {
    elizaLogger7.error("[generateFiller] Error generating filler:", err);
    return "";
  }
}
async function speakFiller(runtime, sttTtsPlugin, fillerType, sleepAfterMs = 3e3) {
  if (!sttTtsPlugin) return;
  const text = await generateFiller(runtime, fillerType);
  if (!text) return;
  elizaLogger7.log(`[Space] Filler (${fillerType}) => ${text}`);
  await sttTtsPlugin.speakText(text);
  if (sleepAfterMs > 0) {
    await new Promise((res) => setTimeout(res, sleepAfterMs));
  }
}
async function generateTopicsIfEmpty(runtime) {
  try {
    const context = composeContext5({
      state: {},
      template: `
# INSTRUCTIONS:
Please generate 5 short topic ideas for a Twitter Space about technology or random interesting subjects.
Return them as a comma-separated list, no additional formatting or numbering.

Example:
"AI Advances, Futuristic Gadgets, Space Exploration, Quantum Computing, Digital Ethics"
---
`
    });
    const response = await generateText3({
      runtime,
      context,
      modelClass: ModelClass5.SMALL
    });
    const topics = response.split(",").map((t) => t.trim()).filter(Boolean);
    return topics.length ? topics : ["Random Tech Chat", "AI Thoughts"];
  } catch (err) {
    elizaLogger7.error("[generateTopicsIfEmpty] GPT error =>", err);
    return ["Random Tech Chat", "AI Thoughts"];
  }
}
var TwitterSpaceClient = class {
  runtime;
  client;
  scraper;
  isSpaceRunning = false;
  currentSpace;
  spaceId;
  startedAt;
  checkInterval;
  lastSpaceEndedAt;
  sttTtsPlugin;
  /**
   * We now store an array of active speakers, not just 1
   */
  activeSpeakers = [];
  speakerQueue = [];
  decisionOptions;
  constructor(client, runtime) {
    this.client = client;
    this.scraper = client.twitterClient;
    this.runtime = runtime;
    const charSpaces = runtime.character.twitterSpaces || {};
    this.decisionOptions = {
      maxSpeakers: charSpaces.maxSpeakers ?? 1,
      topics: charSpaces.topics ?? [],
      typicalDurationMinutes: charSpaces.typicalDurationMinutes ?? 30,
      idleKickTimeoutMs: charSpaces.idleKickTimeoutMs ?? 5 * 6e4,
      minIntervalBetweenSpacesMinutes: charSpaces.minIntervalBetweenSpacesMinutes ?? 60,
      businessHoursOnly: charSpaces.businessHoursOnly ?? false,
      randomChance: charSpaces.randomChance ?? 0.3,
      enableIdleMonitor: charSpaces.enableIdleMonitor !== false,
      enableSttTts: charSpaces.enableSttTts !== false,
      enableRecording: charSpaces.enableRecording !== false,
      voiceId: charSpaces.voiceId || runtime.character.settings.voice.model || "Xb7hH8MSUJpSbSDYk0k2",
      sttLanguage: charSpaces.sttLanguage || "en",
      speakerMaxDurationMs: charSpaces.speakerMaxDurationMs ?? 4 * 6e4
    };
  }
  /**
   * Periodic check to launch or manage space
   */
  async startPeriodicSpaceCheck() {
    elizaLogger7.log("[Space] Starting periodic check routine...");
    const intervalMsWhenIdle = 5 * 6e4;
    const intervalMsWhenRunning = 5e3;
    const routine = async () => {
      try {
        if (!this.isSpaceRunning) {
          const launch = await this.shouldLaunchSpace();
          if (launch) {
            const config = await this.generateSpaceConfig();
            await this.startSpace(config);
          }
          this.checkInterval = setTimeout(
            routine,
            this.isSpaceRunning ? intervalMsWhenRunning : intervalMsWhenIdle
          );
        } else {
          await this.manageCurrentSpace();
          this.checkInterval = setTimeout(
            routine,
            intervalMsWhenRunning
          );
        }
      } catch (error) {
        elizaLogger7.error("[Space] Error in routine =>", error);
        this.checkInterval = setTimeout(routine, intervalMsWhenIdle);
      }
    };
    routine();
  }
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = void 0;
    }
  }
  async shouldLaunchSpace() {
    const r = Math.random();
    if (r > (this.decisionOptions.randomChance ?? 0.3)) {
      elizaLogger7.log("[Space] Random check => skip launching");
      return false;
    }
    if (this.decisionOptions.businessHoursOnly) {
      const hour = (/* @__PURE__ */ new Date()).getUTCHours();
      if (hour < 9 || hour >= 17) {
        elizaLogger7.log("[Space] Out of business hours => skip");
        return false;
      }
    }
    const now = Date.now();
    if (this.lastSpaceEndedAt) {
      const minIntervalMs = (this.decisionOptions.minIntervalBetweenSpacesMinutes ?? 60) * 6e4;
      if (now - this.lastSpaceEndedAt < minIntervalMs) {
        elizaLogger7.log("[Space] Too soon since last space => skip");
        return false;
      }
    }
    elizaLogger7.log("[Space] Deciding to launch a new Space...");
    return true;
  }
  async generateSpaceConfig() {
    if (!this.decisionOptions.topics || this.decisionOptions.topics.length === 0) {
      const newTopics = await generateTopicsIfEmpty(this.client.runtime);
      this.decisionOptions.topics = newTopics;
    }
    let chosenTopic = "Random Tech Chat";
    if (this.decisionOptions.topics && this.decisionOptions.topics.length > 0) {
      chosenTopic = this.decisionOptions.topics[Math.floor(
        Math.random() * this.decisionOptions.topics.length
      )];
    }
    return {
      mode: "INTERACTIVE",
      title: chosenTopic,
      description: `Discussion about ${chosenTopic}`,
      languages: ["en"]
    };
  }
  async startSpace(config) {
    elizaLogger7.log("[Space] Starting a new Twitter Space...");
    try {
      this.currentSpace = new Space(this.scraper);
      this.isSpaceRunning = false;
      this.spaceId = void 0;
      this.startedAt = Date.now();
      this.activeSpeakers = [];
      this.speakerQueue = [];
      const elevenLabsKey = this.runtime.getSetting("ELEVENLABS_XI_API_KEY") || "";
      const broadcastInfo = await this.currentSpace.initialize(config);
      this.spaceId = broadcastInfo.room_id;
      if (this.decisionOptions.enableRecording) {
        elizaLogger7.log("[Space] Using RecordToDiskPlugin");
        this.currentSpace.use(new RecordToDiskPlugin());
      }
      if (this.decisionOptions.enableSttTts) {
        elizaLogger7.log("[Space] Using SttTtsPlugin");
        const sttTts = new SttTtsPlugin();
        this.sttTtsPlugin = sttTts;
        this.currentSpace.use(sttTts, {
          runtime: this.runtime,
          client: this.client,
          spaceId: this.spaceId,
          elevenLabsApiKey: elevenLabsKey,
          voiceId: this.decisionOptions.voiceId,
          sttLanguage: this.decisionOptions.sttLanguage,
          transcriptionService: this.client.runtime.getService(
            ServiceType4.TRANSCRIPTION
          )
        });
      }
      if (this.decisionOptions.enableIdleMonitor) {
        elizaLogger7.log("[Space] Using IdleMonitorPlugin");
        this.currentSpace.use(
          new IdleMonitorPlugin(
            this.decisionOptions.idleKickTimeoutMs ?? 6e4,
            1e4
          )
        );
      }
      this.isSpaceRunning = true;
      await this.scraper.sendTweet(
        broadcastInfo.share_url.replace("broadcasts", "spaces")
      );
      const spaceUrl = broadcastInfo.share_url.replace(
        "broadcasts",
        "spaces"
      );
      elizaLogger7.log(`[Space] Space started => ${spaceUrl}`);
      await speakFiller(
        this.client.runtime,
        this.sttTtsPlugin,
        "WELCOME"
      );
      this.currentSpace.on("occupancyUpdate", (update) => {
        elizaLogger7.log(
          `[Space] Occupancy => ${update.occupancy} participant(s).`
        );
      });
      this.currentSpace.on(
        "speakerRequest",
        async (req) => {
          elizaLogger7.log(
            `[Space] Speaker request from @${req.username} (${req.userId}).`
          );
          await this.handleSpeakerRequest(req);
        }
      );
      this.currentSpace.on("idleTimeout", async (info) => {
        elizaLogger7.log(
          `[Space] idleTimeout => no audio for ${info.idleMs} ms.`
        );
        await speakFiller(
          this.client.runtime,
          this.sttTtsPlugin,
          "IDLE_ENDING"
        );
        await this.stopSpace();
      });
      process.on("SIGINT", async () => {
        elizaLogger7.log("[Space] SIGINT => stopping space");
        await speakFiller(
          this.client.runtime,
          this.sttTtsPlugin,
          "CLOSING"
        );
        await this.stopSpace();
        process.exit(0);
      });
    } catch (error) {
      elizaLogger7.error("[Space] Error launching Space =>", error);
      this.isSpaceRunning = false;
      throw error;
    }
  }
  /**
   * Periodic management: check durations, remove extras, maybe accept new from queue
   */
  async manageCurrentSpace() {
    var _a, _b;
    if (!this.spaceId || !this.currentSpace) return;
    try {
      const audioSpace = await this.scraper.getAudioSpaceById(
        this.spaceId
      );
      const { participants } = audioSpace;
      const numSpeakers = ((_a = participants.speakers) == null ? void 0 : _a.length) || 0;
      const totalListeners = ((_b = participants.listeners) == null ? void 0 : _b.length) || 0;
      const maxDur = this.decisionOptions.speakerMaxDurationMs ?? 24e4;
      const now = Date.now();
      for (let i = this.activeSpeakers.length - 1; i >= 0; i--) {
        const speaker = this.activeSpeakers[i];
        const elapsed = now - speaker.startTime;
        if (elapsed > maxDur) {
          elizaLogger7.log(
            `[Space] Speaker @${speaker.username} exceeded max duration => removing`
          );
          await this.removeSpeaker(speaker.userId);
          this.activeSpeakers.splice(i, 1);
          await speakFiller(
            this.client.runtime,
            this.sttTtsPlugin,
            "SPEAKER_LEFT"
          );
        }
      }
      await this.acceptSpeakersFromQueueIfNeeded();
      if (numSpeakers > (this.decisionOptions.maxSpeakers ?? 1)) {
        elizaLogger7.log(
          "[Space] More than maxSpeakers => removing extras..."
        );
        await this.kickExtraSpeakers(participants.speakers);
      }
      const elapsedMinutes = (now - (this.startedAt || 0)) / 6e4;
      if (elapsedMinutes > (this.decisionOptions.typicalDurationMinutes ?? 30) || numSpeakers === 0 && totalListeners === 0 && elapsedMinutes > 5) {
        elizaLogger7.log(
          "[Space] Condition met => stopping the Space..."
        );
        await speakFiller(
          this.client.runtime,
          this.sttTtsPlugin,
          "CLOSING",
          4e3
        );
        await this.stopSpace();
      }
    } catch (error) {
      elizaLogger7.error("[Space] Error in manageCurrentSpace =>", error);
    }
  }
  /**
   * If we have available slots, accept new speakers from the queue
   */
  async acceptSpeakersFromQueueIfNeeded() {
    const ms = this.decisionOptions.maxSpeakers ?? 1;
    while (this.speakerQueue.length > 0 && this.activeSpeakers.length < ms) {
      const nextReq = this.speakerQueue.shift();
      if (nextReq) {
        await speakFiller(
          this.client.runtime,
          this.sttTtsPlugin,
          "PRE_ACCEPT"
        );
        await this.acceptSpeaker(nextReq);
      }
    }
  }
  async handleSpeakerRequest(req) {
    var _a;
    if (!this.spaceId || !this.currentSpace) return;
    const audioSpace = await this.scraper.getAudioSpaceById(this.spaceId);
    const janusSpeakers = ((_a = audioSpace == null ? void 0 : audioSpace.participants) == null ? void 0 : _a.speakers) || [];
    if (janusSpeakers.length < (this.decisionOptions.maxSpeakers ?? 1)) {
      elizaLogger7.log(`[Space] Accepting speaker @${req.username} now`);
      await speakFiller(
        this.client.runtime,
        this.sttTtsPlugin,
        "PRE_ACCEPT"
      );
      await this.acceptSpeaker(req);
    } else {
      elizaLogger7.log(
        `[Space] Adding speaker @${req.username} to the queue`
      );
      this.speakerQueue.push(req);
    }
  }
  async acceptSpeaker(req) {
    if (!this.currentSpace) return;
    try {
      await this.currentSpace.approveSpeaker(req.userId, req.sessionUUID);
      this.activeSpeakers.push({
        userId: req.userId,
        sessionUUID: req.sessionUUID,
        username: req.username,
        startTime: Date.now()
      });
      elizaLogger7.log(`[Space] Speaker @${req.username} is now live`);
    } catch (err) {
      elizaLogger7.error(
        `[Space] Error approving speaker @${req.username}:`,
        err
      );
    }
  }
  async removeSpeaker(userId) {
    if (!this.currentSpace) return;
    try {
      await this.currentSpace.removeSpeaker(userId);
      elizaLogger7.log(`[Space] Removed speaker userId=${userId}`);
    } catch (error) {
      elizaLogger7.error(
        `[Space] Error removing speaker userId=${userId} =>`,
        error
      );
    }
  }
  /**
   * If more than maxSpeakers are found, remove extras
   * Also update activeSpeakers array
   */
  async kickExtraSpeakers(speakers) {
    if (!this.currentSpace) return;
    const ms = this.decisionOptions.maxSpeakers ?? 1;
    const extras = speakers.slice(ms);
    for (const sp of extras) {
      elizaLogger7.log(
        `[Space] Removing extra speaker => userId=${sp.user_id}`
      );
      await this.removeSpeaker(sp.user_id);
      const idx = this.activeSpeakers.findIndex(
        (s) => s.userId === sp.user_id
      );
      if (idx !== -1) {
        this.activeSpeakers.splice(idx, 1);
      }
    }
  }
  async stopSpace() {
    if (!this.currentSpace || !this.isSpaceRunning) return;
    try {
      elizaLogger7.log("[Space] Stopping the current Space...");
      await this.currentSpace.stop();
    } catch (err) {
      elizaLogger7.error("[Space] Error stopping Space =>", err);
    } finally {
      this.isSpaceRunning = false;
      this.spaceId = void 0;
      this.currentSpace = void 0;
      this.startedAt = void 0;
      this.lastSpaceEndedAt = Date.now();
      this.activeSpeakers = [];
      this.speakerQueue = [];
    }
  }
};

// src/client.ts
var TwitterManager = class {
  client;
  post;
  search;
  interaction;
  space;
  constructor(runtime, twitterConfig) {
    this.client = new ClientBase(runtime, twitterConfig);
    this.post = new TwitterPostClient(this.client, runtime);
    if (twitterConfig.TWITTER_SEARCH_ENABLE) {
      elizaLogger8.warn("Twitter/X client running in a mode that:");
      elizaLogger8.warn("1. violates consent of random users");
      elizaLogger8.warn("2. burns your rate limit");
      elizaLogger8.warn("3. can get your account banned");
      elizaLogger8.warn("use at your own risk");
      this.search = new TwitterSearchClient(this.client, runtime);
    }
    this.interaction = new TwitterInteractionClient(this.client, runtime);
    if (twitterConfig.TWITTER_SPACES_ENABLE) {
      this.space = new TwitterSpaceClient(this.client, runtime);
    }
  }
  async stop() {
    elizaLogger8.warn("Twitter client does not support stopping yet");
  }
};
var TwitterClientInterface = {
  name: "twitter",
  async start(runtime) {
    const twitterConfig = await validateTwitterConfig(runtime);
    elizaLogger8.log("Twitter client started");
    const manager = new TwitterManager(runtime, twitterConfig);
    await manager.client.init();
    await manager.post.start();
    if (manager.search) {
      await manager.search.start();
    }
    await manager.interaction.start();
    if (manager.space) {
      manager.space.startPeriodicSpaceCheck();
    }
    return manager;
  }
};

// src/index.ts
var twitterPlugin = {
  name: "twitter",
  description: "Twitter client",
  clients: [TwitterClientInterface]
};
var index_default = twitterPlugin;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map