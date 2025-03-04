import * as _elizaos_core from '@elizaos/core';

declare const twitterPlugin: {
    name: string;
    description: string;
    clients: _elizaos_core.Client[];
    providers: _elizaos_core.Provider[];
    evaluators: _elizaos_core.Evaluator[];
};

export { twitterPlugin as default };
