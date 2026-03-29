export type MemoryTag = "project" | "personal" | "preference" | "decision" | "context";

export interface MemoryFact {
  id: string;
  tag: MemoryTag;
  text: string;
  at: string; // ISO date (date only)
}

export interface MemorySnapshot {
  v: number;
  updated: string; // ISO datetime
  facts: MemoryFact[];
}

export class MemoryStore {
  private facts = new Map<string, MemoryFact>();
  private nextId = 1;

  load(snapshot: MemorySnapshot): void {
    this.facts.clear();
    let maxId = 0;
    for (const fact of snapshot.facts) {
      this.facts.set(fact.id, fact);
      const num = parseInt(fact.id.replace("f", ""), 10);
      if (num > maxId) maxId = num;
    }
    this.nextId = maxId + 1;
  }

  snapshot(): MemorySnapshot {
    return {
      v: 1,
      updated: new Date().toISOString(),
      facts: this.all(),
    };
  }

  all(): MemoryFact[] {
    return Array.from(this.facts.values());
  }

  byTag(tag: MemoryTag): MemoryFact[] {
    return this.all().filter((f) => f.tag === tag);
  }

  get(id: string): MemoryFact | undefined {
    return this.facts.get(id);
  }

  add(tag: MemoryTag, text: string): MemoryFact {
    const id = `f${String(this.nextId++).padStart(3, "0")}`;
    const fact: MemoryFact = {
      id,
      tag,
      text,
      at: new Date().toISOString().slice(0, 10),
    };
    this.facts.set(id, fact);
    return fact;
  }

  update(id: string, text: string): boolean {
    const fact = this.facts.get(id);
    if (!fact) return false;
    fact.text = text;
    fact.at = new Date().toISOString().slice(0, 10);
    return true;
  }

  remove(id: string): boolean {
    return this.facts.delete(id);
  }

  search(query: string): MemoryFact[] {
    const lower = query.toLowerCase();
    return this.all().filter(
      (f) => f.text.toLowerCase().includes(lower) || f.tag.includes(lower)
    );
  }

  isEmpty(): boolean {
    return this.facts.size === 0;
  }

  toJSON(): string {
    return JSON.stringify(this.snapshot(), null, 2);
  }
}

const TAG_ORDER: MemoryTag[] = ["project", "decision", "context", "personal", "preference"];

/** Build a human-readable system prompt section from memory facts. */
export const buildMemoryPrompt = (facts: MemoryFact[]): string => {
  if (facts.length === 0) return "";

  const grouped = new Map<MemoryTag, MemoryFact[]>();
  for (const fact of facts) {
    const list = grouped.get(fact.tag) || [];
    list.push(fact);
    grouped.set(fact.tag, list);
  }

  const sections: string[] = [];
  for (const tag of TAG_ORDER) {
    const list = grouped.get(tag);
    if (!list?.length) continue;
    const heading = tag.charAt(0).toUpperCase() + tag.slice(1);
    const bullets = list.map((f) => `- ${f.text}`).join("\n");
    sections.push(`## ${heading}\n${bullets}`);
  }

  return `\n\nYou know the following about the user:\n\n${sections.join("\n\n")}`;
};

/** Format facts for display in Telegram (HTML). */
export const formatMemoryList = (facts: MemoryFact[]): string => {
  if (facts.length === 0) return "No memories stored yet.";

  const grouped = new Map<MemoryTag, MemoryFact[]>();
  for (const fact of facts) {
    const list = grouped.get(fact.tag) || [];
    list.push(fact);
    grouped.set(fact.tag, list);
  }

  const sections: string[] = [];
  for (const tag of TAG_ORDER) {
    const list = grouped.get(tag);
    if (!list?.length) continue;
    const heading = tag.charAt(0).toUpperCase() + tag.slice(1);
    const bullets = list.map((f) => `  <code>${f.id}</code> ${f.text}`).join("\n");
    sections.push(`<b>${heading}</b>\n${bullets}`);
  }

  return sections.join("\n\n");
};
