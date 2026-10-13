## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, eslint, vitest, tailwindcss, mdsvex, ai-tools

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.


## Git commit message

At the end of every response you give to the user when you make code changes, provide a short git commit message summarizing the changes for the user to copy.

## Solution Quality Check

- Before implementing a requested feature/fix/etc., identify the underlying problem and the abstraction that owns it.
- If the requested approach looks like a workaround, briefly point that out and suggest the simplest established or standard solution instead.
- Prefer root-cause fixes over compensating logic, especially when a parser, library, framework feature, or existing helper already addresses the problem.
- For non-obvious tradeoffs, explain the recommendation plainly and then proceed with the best-practice option unless the user explicitly requires the workaround.

## Dependency Security

Do not add or install dependencies unless the user explicitly requests or authorizes it. A feature request alone does not authorize adding a dependency. If a dependency appears necessary and the user has not authorized it, pause implementation and ask for confirmation before proceeding.