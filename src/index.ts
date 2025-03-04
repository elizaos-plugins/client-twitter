import { TwitterClientInterface } from "./client";
import { reflectEvaluator } from "./evaluators/reflect";
import { reflectionsProvider } from "./providers/reflections";

const twitterPlugin = {
    name: "twitter",
    description: "Twitter client",
    clients: [TwitterClientInterface],
    providers: [reflectionsProvider],
    evaluators: [reflectEvaluator],
};
export default twitterPlugin;
