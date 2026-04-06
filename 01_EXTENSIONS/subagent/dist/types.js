import { Type } from "@sinclair/typebox";
export const SubagentParams = Type.Object({
    command: Type.String({ description: "Subcommand string (e.g. 'run scout -- find auth code')" }),
});
