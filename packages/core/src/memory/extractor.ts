import Anthropic from "@anthropic-ai/sdk";
import { MemoryExtractionConfig } from "../config";
import { Logger } from "../logging";
import { MemoryFact, MemoryTag } from "./store";

export interface MemoryChanges {
  add: { tag: MemoryTag; text: string }[];
  update: { id: string; text: string }[];
  remove: string[];
}

const EMPTY_CHANGES: MemoryChanges = { add: [], update: [], remove: [] };

const VALID_TAGS = new Set<MemoryTag>(["project", "personal", "preference", "decision", "context"]);

const EXTRACTION_PROMPT = `You are a memory manager for a personal AI assistant. Analyze the conversation below and compare against existing memories. Output changes needed.

Rules:
- Only record facts with long-term value: projects, decisions, preferences, personal context, technical choices
- Ignore transient questions ("what's the weather", "translate this")
- If new info conflicts with existing memory, output an update
- If existing memory is clearly outdated, output a remove
- Keep each fact under 80 characters
- Assign a tag: project | personal | preference | decision | context
- Output strict JSON, nothing else. If no changes needed, output: {"add":[],"update":[],"remove":[]}

Current memories:
{current_facts}

Conversation:
{conversation}

Output:`;

export class MemoryExtractor {
  private extractionConfig: MemoryExtractionConfig;

  constructor(
    extractionConfig: MemoryExtractionConfig,
    private readonly logger?: Logger,
  ) {
    this.extractionConfig = extractionConfig;
  }

  async extract(conversation: string, currentFacts: MemoryFact[]): Promise<MemoryChanges> {
    const factsJson = currentFacts.length > 0
      ? JSON.stringify(currentFacts.map((f) => ({ id: f.id, tag: f.tag, text: f.text })))
      : "[]";

    const prompt = EXTRACTION_PROMPT
      .replace("{current_facts}", factsJson)
      .replace("{conversation}", conversation);

    try {
      const text = this.extractionConfig.provider === "anthropic"
        ? await this.callAnthropic(prompt)
        : await this.callOpenAI(prompt);

      return this.parseChanges(text);
    } catch (error) {
      this.logger?.warn("Memory extraction failed.", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return EMPTY_CHANGES;
    }
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const client = new Anthropic({ apiKey: this.extractionConfig.apiKey });
    const response = await client.messages.create({
      model: this.extractionConfig.model,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const baseUrl = this.extractionConfig.baseUrl!.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.extractionConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: this.extractionConfig.model,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI-compatible API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content || "";
  }

  private parseChanges(text: string): MemoryChanges {
    try {
      // Extract JSON from response (may have surrounding text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return EMPTY_CHANGES;

      const raw = JSON.parse(jsonMatch[0]);

      const changes: MemoryChanges = { add: [], update: [], remove: [] };

      if (Array.isArray(raw.add)) {
        for (const item of raw.add) {
          if (item.tag && VALID_TAGS.has(item.tag) && typeof item.text === "string") {
            changes.add.push({ tag: item.tag, text: item.text.slice(0, 80) });
          }
        }
      }

      if (Array.isArray(raw.update)) {
        for (const item of raw.update) {
          if (typeof item.id === "string" && typeof item.text === "string") {
            changes.update.push({ id: item.id, text: item.text.slice(0, 80) });
          }
        }
      }

      if (Array.isArray(raw.remove)) {
        for (const id of raw.remove) {
          if (typeof id === "string") {
            changes.remove.push(id);
          }
        }
      }

      return changes;
    } catch {
      this.logger?.warn("Failed to parse memory extraction response.", { text: text.slice(0, 200) });
      return EMPTY_CHANGES;
    }
  }
}
