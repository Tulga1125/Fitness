// Who may do what. Checked on the server in every action and page — never only by hiding buttons.
export type Role = "DIRECTOR" | "ACCOUNTANT" | "MANAGER" | "SITE_MANAGER" | "DRIVER";

const matrix = {
  // Revenue, rates, margin and profit. The manager's dashboard hides them.
  "money.view": ["DIRECTOR", "ACCOUNTANT"],
  "dashboard.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER", "SITE_MANAGER"],
  "contracts.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER"],
  "contracts.edit": ["ACCOUNTANT", "MANAGER"],
  "trips.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER", "SITE_MANAGER"],
  "trips.edit": ["MANAGER"],
  "trips.close": ["ACCOUNTANT"],
  "docs.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER", "SITE_MANAGER"],
  "docs.upload": ["ACCOUNTANT", "MANAGER", "SITE_MANAGER", "DRIVER"],
  // Decided by the owner: only the accountant approves tickets and fuel.
  "docs.approve": ["ACCOUNTANT"],
  // Changing an already approved record needs a reason and is logged.
  "docs.editApproved": ["ACCOUNTANT", "DIRECTOR"],
  "fleet.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER", "SITE_MANAGER"],
  "fleet.edit": ["MANAGER"],
  "insurance.edit": ["ACCOUNTANT", "MANAGER"],
  "drivers.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER", "SITE_MANAGER"],
  "drivers.edit": ["MANAGER"],
  "fuelReport.view": ["DIRECTOR", "ACCOUNTANT", "MANAGER"],
  "settings.edit": ["DIRECTOR"],
  // Driver page: own trips, own pay, upload a photo.
  "driver.self": ["DRIVER"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof matrix;

export function can(role: Role, action: Action): boolean {
  return (matrix[action] as readonly Role[]).includes(role);
}

export const roleLabel: Record<Role, string> = {
  DIRECTOR: "Захирал",
  ACCOUNTANT: "Нягтлан",
  MANAGER: "Менежер",
  SITE_MANAGER: "Талбайн менежер",
  DRIVER: "Жолооч",
};
