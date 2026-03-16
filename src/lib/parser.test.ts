import { describe, test, expect } from "bun:test";
import { parseJsonlOutput } from "./parser.ts";

describe("parseJsonlOutput", () => {
  test("extracts agent messages from item.completed events", () => {
    const input = [
      JSON.stringify({ type: "thread.started", thread_id: "abc" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "I will create the file." },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_2", type: "agent_message", text: "Done creating the file." },
      }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 50 } }),
    ].join("\n");

    const result = parseJsonlOutput(input);
    expect(result.text).toBe("I will create the file.\nDone creating the file.");
    expect(result.events).toHaveLength(5);
  });

  test("includes command execution output", () => {
    const input = [
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "Running the command." },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "echo hello",
          aggregated_output: "hello\n",
          exit_code: 0,
          status: "completed",
        },
      }),
    ].join("\n");

    const result = parseJsonlOutput(input);
    expect(result.text).toContain("Running the command.");
    expect(result.text).toContain("[command: echo hello]");
    expect(result.text).toContain("hello");
  });

  test("skips command executions with empty output", () => {
    const input = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "command_execution",
        command: "touch foo.txt",
        aggregated_output: "",
        exit_code: 0,
        status: "completed",
      },
    });

    const result = parseJsonlOutput(input);
    expect(result.text).toBe("");
  });

  test("handles legacy message.output_text.delta events", () => {
    const input = [
      JSON.stringify({ type: "message.output_text.delta", delta: "Hello " }),
      JSON.stringify({ type: "message.output_text.delta", delta: "world" }),
    ].join("\n");

    const result = parseJsonlOutput(input);
    expect(result.text).toBe("Hello \nworld");
  });

  test("handles legacy message.completed with full text", () => {
    const input = JSON.stringify({
      type: "message.completed",
      message: { output_text: "Complete response text" },
    });

    const result = parseJsonlOutput(input);
    expect(result.text).toBe("Complete response text");
  });

  test("prefers deltas over message.completed", () => {
    const input = [
      JSON.stringify({ type: "message.output_text.delta", delta: "from deltas" }),
      JSON.stringify({
        type: "message.completed",
        message: { output_text: "from completed" },
      }),
    ].join("\n");

    const result = parseJsonlOutput(input);
    expect(result.text).toBe("from deltas");
    expect(result.text).not.toContain("from completed");
  });

  test("handles non-JSON lines as plain text", () => {
    const input = "Some plain text output\nNot JSON at all";

    const result = parseJsonlOutput(input);
    expect(result.text).toBe("Some plain text output\nNot JSON at all");
    expect(result.events).toHaveLength(0);
  });

  test("handles empty input", () => {
    const result = parseJsonlOutput("");
    expect(result.text).toBe("");
    expect(result.events).toHaveLength(0);
  });

  test("handles mixed JSON and non-JSON lines", () => {
    const input = [
      "Some preamble",
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "Done." },
      }),
    ].join("\n");

    const result = parseJsonlOutput(input);
    expect(result.text).toContain("Some preamble");
    expect(result.text).toContain("Done.");
    expect(result.events).toHaveLength(1);
  });
});
