import type { CustomAction } from "./storage";

export interface ActionContext {
  hostname?: string;
  language?: string;
}

export interface PromptPayload {
  system?: string;
  user: string;
}

export interface ActionItem {
  id: string;
  name: string;
  description?: string;
  type: "builtin" | "custom";
  icon?: string;
  color?: string;
  category?: string;
  shortcut?: { key: string; ctrl: boolean; alt: boolean; shift: boolean };
  replaceMode?: "replace" | "preview";
  enabled: boolean;
}

export interface ActionHandler extends ActionItem {
  provider?: string;
  model?: string;
  temperature?: number;
  buildPrompt(input: string, context: ActionContext): PromptPayload;
}

const BUILTIN_INSTRUCTIONS =
  "IMPORTANT: Return ONLY the final rewritten text. Do NOT include any introductory notes, explanations, conversational filler, conversational prefixes, quotes, or markdown wrappers unless markdown was in the original text. Just output the clean rewritten text directly.";

export class ActionRegistry {
  private builtins = new Map<string, ActionHandler>();
  private customs = new Map<string, ActionHandler>();

  constructor() {
    this.registerBuiltins();
  }

  private registerBuiltins() {
    const build = (
      id: string,
      name: string,
      icon: string,
      category: string,
      buildPrompt: (input: string) => string,
    ): ActionHandler => ({
      id,
      name,
      type: "builtin",
      icon,
      category,
      enabled: true,
      replaceMode: "replace",
      buildPrompt(input: string, _ctx: ActionContext) {
        return { user: buildPrompt(input) };
      },
    });

    this.register(
      build(
        "improve",
        "Improve writing",
        "Feather",
        "primary",
        (input) =>
          `Improve the writing quality, grammar, flow, and vocabulary of the following text to make it polished and engaging:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "paraphrase",
        "Paraphrase text",
        "RefreshCw",
        "primary",
        (input) =>
          `Paraphrase the following text to make it sound natural, fresh, and clear while fully maintaining its original meaning:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "fix_spelling",
        "Fix spelling & grammar",
        "Check",
        "primary",
        (input) =>
          `Fix all spelling mistakes, typographical errors, and grammatical slips in the following text. Keep it exact and do not change the tone or structure unless necessary to fix errors:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "tone_professional",
        "Professional",
        "Briefcase",
        "tone",
        (input) =>
          `Rewrite the following text in a clear, professional, and business-appropriate tone:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "tone_casual",
        "Casual",
        "MessageSquare",
        "tone",
        (input) =>
          `Rewrite the following text in a friendly, conversational, and casual tone:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "tone_exciting",
        "Exciting",
        "Zap",
        "tone",
        (input) =>
          `Rewrite the following text in an enthusiastic, engaging, and exciting tone:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "tone_friendly",
        "Friendly",
        "Heart",
        "tone",
        (input) =>
          `Rewrite the following text in a warm, polite, and friendly tone:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "length_shorter",
        "Shorter",
        "Minimize2",
        "length",
        (input) =>
          `Shorten the following text to make it extremely concise and direct while preserving the main message:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );

    this.register(
      build(
        "length_longer",
        "Longer",
        "Maximize2",
        "length",
        (input) =>
          `Expand the following text by adding relevant details and descriptive depth to make it more comprehensive, without changing the core meaning:\n\n"${input}"\n\n${BUILTIN_INSTRUCTIONS}`,
      ),
    );
  }

  register(handler: ActionHandler) {
    const map = handler.type === "builtin" ? this.builtins : this.customs;
    map.set(handler.id, handler);
  }

  async loadCustoms(): Promise<void> {
    const { customActions } = (await chrome.storage.local.get(
      "customActions",
    )) as { customActions?: CustomAction[] };
    this.customs.clear();
    for (const ca of customActions || []) {
      if (!ca.enabled) continue;
      this.customs.set(ca.id, this.customActionToHandler(ca));
    }
  }

  private customActionToHandler(ca: CustomAction): ActionHandler {
    return {
      id: ca.id,
      name: ca.name,
      description: ca.description,
      type: "custom",
      icon: ca.icon,
      color: ca.color,
      category: ca.category || "custom",
      shortcut: ca.shortcut,
      replaceMode: ca.replaceMode,
      enabled: ca.enabled,
      provider: ca.provider,
      model: ca.model,
      temperature: ca.temperature,
      buildPrompt(input: string, _ctx: ActionContext): PromptPayload {
        const user = ca.promptTemplate.replace(/\{\{input\}\}/g, input);
        return { system: ca.systemPrompt, user };
      },
    };
  }

  getAll(): ActionHandler[] {
    const items: ActionHandler[] = [];
    for (const h of this.builtins.values()) items.push(h);
    for (const h of this.customs.values()) items.push(h);
    return items;
  }

  get(id: string): ActionHandler | undefined {
    return this.builtins.get(id) || this.customs.get(id);
  }

  getByCategory(category: string): ActionHandler[] {
    return this.getAll().filter((h) => h.category === category);
  }

  buildPrompt(
    id: string,
    input: string,
    context?: ActionContext,
  ): PromptPayload {
    const handler = this.get(id);
    if (!handler) throw new Error(`Unknown action: ${id}`);
    return handler.buildPrompt(input, context || {});
  }
}
