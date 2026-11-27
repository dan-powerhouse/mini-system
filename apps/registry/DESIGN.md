# Registry visual system

Every look in `apps/registry` comes from two places. Change it there, not in a screen.

## 1. Tokens: `app/globals.css`

Raw values live in `:root` (light) and `.dark`; `@theme inline` turns them into Tailwind utilities.

| Token | Utility | Used for |
| --- | --- | --- |
| `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted-foreground`, `--destructive`, `--border`, `--input`, `--ring` | `bg-card`, `text-primary`, `border-input`, … | Surfaces, text, controls |
| `--actor-human`, `--actor-agent`, `--actor-machine` | `bg-actor-agent/12`, `text-actor-machine`, … | Workforce pills (Human, LLM agent, Machine) |
| `--panel-radius` (28px) | `rounded-panel` | Cards, dialogs, empty states |
| `--row-radius` (22px) | `rounded-row` | List rows |
| `--float-shadow` | `shadow-float` | Floating auth card (light and dark values) |
| `--rail`, `--raised` | `bg-rail`, `bg-raised` | Workspace navigation, active workspace and record summary |
| `--panel-shadow`, `--raised-shadow`, `--overlay-shadow` | `shadow-panel`, `shadow-raised`, `shadow-overlay` | Bordered cards, emphasized surfaces and dialogs |
| `--radius` | `rounded-sm` … `rounded-xl` | shadcn primitives in `components/ui` |

Use a border and a light shadow for ordinary cards. Use the raised surface for the part of the screen that holds the current task, such as the record summary. Dialogs carry the strongest shadow. Keep the difference visible in both themes while keeping the existing palette and typography. Geist Sans and Mono load from the pinned font package.

## 2. Kit: `components/kit`

- `recipes.ts` composes tokens into named looks: `panel`, `row`, `field`, `select`, `pill`, `chip()`, `navLink`, `tag`, `notice`, `text`, `cta`, `dialog`, `avatar`. Recipes are plain strings joined with `join()`, never merged, so an element gets exactly the classes it is given.
- `index.tsx` exports components built on them: `Panel`, `PageIntro`, `ErrorNotice`, `EmptyState` (with an optional `action`), `Initial`, `FullscreenNote`, `FloatingCard`, `DisplayTitle`, the loading placeholders `RowSkeletons`, `PanelSkeleton` and `LineSkeletons`, plus `recipes` and `join`.
- Loading placeholders take the shape of what they stand in for (`skeleton` recipes), pulse only under `motion-safe`, and announce themselves once with `role="status"`. Empty states say whether nothing exists yet or a filter hid everything, and offer the next step.

```tsx
import { EmptyState, Initial, recipes } from "@/components/kit";

<Link href={href} className={recipes.row.link}>
  <Initial label={entity.title} />
  …
</Link>
<button className={recipes.chip({ on: selected, tone: "ink", size: "tall" })}>Active</button>
<EmptyState title="Nothing in this view">Archived records stay out until you ask for them.</EmptyState>
```

Layout utilities (`grid gap-2`, `truncate`, margins) stay inline in screens; they are structure, not look.

`components/ui` holds the shadcn primitives (Button, Input, Dialog, …). Screens pass recipe classes to them; the primitives themselves are left as generated.

## Rules

- No raw hex colors, `rounded-[…px]` or `shadow-[…]` in screens. Add a token, then a recipe.
- A look used twice belongs in `recipes.ts`.
- Dark mode is handled by tokens; screens do not need `dark:` variants for color.
- One exception: `themeColor` in `app/layout.tsx` (the browser bar color) must be a literal. It mirrors `--background`; keep both in sync.

## What the screen reads instead of hardcoding

| Concern | Source of truth | When the backend changes |
| --- | --- | --- |
| Record kinds, statuses, roles | `lib/schema.ts`, from the database enums in `lib/database.types.ts` | Regenerate types (`supabase gen types`); new values appear with a readable fallback label |
| Types and their fields | Workspace templates (Ontology); rules in `lib/templates.ts` mirror `private.validate_fields` | Nothing to do in code; a template the visual editor cannot show opens as JSON |
| Relation predicates | Workspace predicates | Nothing to do in code |
| Field controls | Registry in `components/field-input.tsx`, value handling in `lib/fields.ts` | A new field type is shown read-only and saved back unchanged until it gets a control |
| Workspace menu | `lib/sections.ts`, each screen with its minimum role | Add one line per new screen |
| Error messages | `lib/format.ts` | Unknown codes show as sent |
| Actor pills | `lib/actors.ts` (agents of type `machine` are machines) | One constant |
