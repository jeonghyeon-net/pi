import { StringEnum } from "@mariozechner/pi-ai";
import { type Static, Type } from "@sinclair/typebox";

const StatusEnum = StringEnum(["pending", "in_progress", "completed"] as const, {
  description: "Task status",
});

const InputTask = Type.Object({
  content: Type.String({ description: "Task description" }),
  status: StatusEnum,
  activeForm: Type.Optional(
    Type.String({
      description:
        "Present continuous form for display during execution " +
        "(e.g., 'Running tests', '\uD14C\uC2A4\uD2B8 \uC2E4\uD589 \uC911')",
    }),
  ),
  notes: Type.Optional(Type.String({ description: "Additional context or notes" })),
});

export const TodoWriteParams = Type.Object(
  {
    todos: Type.Array(InputTask, { description: "The updated todo list" }),
  },
  { additionalProperties: true },
);

export type TodoWriteParamsType = Static<typeof TodoWriteParams>;

export const TOOL_DESCRIPTION = `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and show the user your overall progress.

## When to Use
- Complex multi-step tasks requiring 3+ distinct steps
- User provides multiple tasks to be done
- Non-trivial tasks requiring careful planning

## When NOT to Use
- Single, straightforward task \u2014 just do it directly
- Trivial tasks completable in less than 3 steps
- Purely conversational or informational requests

## Rules
- Write todo content in Korean when practical
- Update task status in real-time as you work
- Mark tasks complete IMMEDIATELY after finishing \u2014 don't batch completions
- Exactly ONE task should be in_progress at any time
- Complete current tasks before starting new ones
- Remove tasks that are no longer relevant
- ONLY mark completed when FULLY accomplished \u2014 if blocked, keep as in_progress
- If requirements change mid-task, update the todo list before continuing

## Task Fields
- content: Imperative form (e.g., "\uD14C\uC2A4\uD2B8 \uC2E4\uD589", "Run tests")
- status: pending | in_progress | completed
- activeForm: (optional) Present continuous form for display (e.g., "\uD14C\uC2A4\uD2B8 \uC2E4\uD589 \uC911", "Running tests")
- notes: (optional) Additional context`;
