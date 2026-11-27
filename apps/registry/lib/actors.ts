import type { Entity, Kind } from "./model";

/**
 * The three kinds of actor that perform work. This is a view over the registry, not a
 * database kind: people are humans; agents of type "machine" are machines; every other
 * agent type (internal, external, research_agent, …) is an LLM agent.
 */
export type Actor = "human" | "agent" | "machine";

export const MACHINE_TYPE = "machine";

export const ACTORS: { id: Actor; label: string }[] = [
  { id: "human", label: "Human" },
  { id: "agent", label: "LLM agent" },
  { id: "machine", label: "Machine" },
];

export function actorOf(entity: Pick<Entity, "kind" | "type">): Actor | null {
  if (entity.kind === "person") return "human";
  if (entity.kind === "agent") return entity.type === MACHINE_TYPE ? "machine" : "agent";
  return null;
}

export function actorLabel(actor: Actor) {
  return ACTORS.find((item) => item.id === actor)?.label ?? actor;
}

/** The registry kind that stores an actor. */
export function kindOfActor(actor: Actor): Kind {
  return actor === "human" ? "person" : "agent";
}

export const ACTOR_PILL: Record<Actor, string> = {
  human: "bg-actor-human/12 text-actor-human",
  agent: "bg-actor-agent/12 text-actor-agent",
  machine: "bg-actor-machine/14 text-actor-machine",
};
