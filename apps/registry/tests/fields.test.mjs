import assert from "node:assert/strict";
import test from "node:test";
import { defaultDrafts, toAttributes, toDrafts, toggleItem, validateDrafts } from "../lib/fields.ts";

const skills = {
  name: "skills",
  dataType: "multiselect",
  options: ["Design, research", "Design", "research"],
};

test("multiselect drafts and defaults preserve exact option values", () => {
  const attributes = { skills: ["Design, research"] };
  const drafts = toDrafts([skills], attributes);

  assert.deepEqual(drafts, attributes);
  assert.deepEqual(defaultDrafts([{ ...skills, default: attributes.skills }]), attributes);
  assert.deepEqual(validateDrafts([skills], drafts), {});
  assert.deepEqual(toAttributes([skills], drafts), attributes);
});

test("multiselect toggles distinguish a comma option from its individual parts", () => {
  const draft = toggleItem(["Design"], "Design, research", skills.options);
  assert.deepEqual(draft, ["Design, research", "Design"]);
  assert.deepEqual(toggleItem(draft, "Design, research", skills.options), ["Design"]);
  assert.match(validateDrafts([skills], { skills: ["Other"] }).skills, /Not an option/);
  assert.match(validateDrafts([skills], { skills: ["Design", "Design"] }).skills, /only once/);
});

test("attribute edits preserve untouched values and can explicitly clear an optional field", () => {
  const title = { name: "label", dataType: "text" };
  const notes = { name: "summary", dataType: "text" };
  const stored = { label: "", summary: "Old", skills: ["Design, research"] };
  assert.deepEqual(toAttributes([title, notes, skills], { summary: "" }, stored), {
    label: "",
    skills: ["Design, research"],
  });
});
