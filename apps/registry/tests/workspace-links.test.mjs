import assert from "node:assert/strict";
import test from "node:test";
import { registryHref, workspaceOverviewHref, findWorkspaceView } from "../lib/workspace-links.ts";

test("existing Registry URLs stay valid and saved view links carry only the view ID", () => {
  assert.equal(workspaceOverviewHref("harbor"), "/w/harbor/workspace");
  assert.equal(registryHref("harbor"), "/w/harbor");
  assert.equal(registryHref("harbor", "saved view"), "/w/harbor?view=saved+view");
});

test("view links only resolve against visible views in the selected workspace", () => {
  const view = { id: "view-1", workspace_id: "harbor" };
  assert.equal(findWorkspaceView([view], "harbor", "view-1"), view);
  assert.equal(findWorkspaceView([view], "north", "view-1"), undefined);
  assert.equal(findWorkspaceView([], "harbor", "view-1"), undefined);
});
