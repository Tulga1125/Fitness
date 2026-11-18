import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("permissions", () => {
  it("lets only the accountant approve tickets and fuel", () => {
    expect(can("ACCOUNTANT", "docs.approve")).toBe(true);
    for (const r of ["DIRECTOR", "MANAGER", "SITE_MANAGER", "DRIVER"] as const) expect(can(r, "docs.approve")).toBe(false);
  });
  it("hides money from the manager and the site manager", () => {
    expect(can("MANAGER", "money.view")).toBe(false);
    expect(can("SITE_MANAGER", "money.view")).toBe(false);
    expect(can("DIRECTOR", "money.view")).toBe(true);
  });
  it("keeps drivers out of office screens", () => {
    for (const a of ["trips.view", "docs.view", "fleet.view", "dashboard.view", "contracts.view"] as const) {
      expect(can("DRIVER", a)).toBe(false);
    }
    expect(can("DRIVER", "docs.upload")).toBe(true);
  });
});
