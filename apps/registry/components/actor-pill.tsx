import { ACTOR_PILL, actorLabel, actorOf, type Actor } from "@/lib/actors";
import type { Entity } from "@/lib/model";

export function ActorPill({ actor, className = "" }: { actor: Actor; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium ${ACTOR_PILL[actor]} ${className}`}>
      {actorLabel(actor)}
    </span>
  );
}

/** Pill for an entity that performs work; nothing for objects, process kinds or apps. */
export function EntityActorPill({ entity, className }: { entity: Pick<Entity, "kind" | "type">; className?: string }) {
  const actor = actorOf(entity);
  return actor ? <ActorPill actor={actor} className={className} /> : null;
}
