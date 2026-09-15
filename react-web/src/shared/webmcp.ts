export function registerSearchTool(search: (value: string) => void) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: unknown,
          options: { signal: AbortSignal },
        ) => unknown;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return;
  const controller = new AbortController();
  try {
    Promise.resolve(
      context.registerTool(
        {
          name: "search_events",
          description:
            "Filtra eventos na tela Explorar pelo título ou nome do local.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string", maxLength: 200 } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              !("query" in input) ||
              typeof input.query !== "string" ||
              input.query.length > 200
            )
              throw Error("Informe query como texto de até 200 caracteres.");
            search(input.query);
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            return { query: input.query, view: "events" };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
  } catch {}
  return () => controller.abort();
}
