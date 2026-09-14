export const STAFF_PERMISSIONS = [
  "orders.view",
  "orders.fulfill",
  "orders.create_on_behalf",
  "orders.rx",
  "orders.dispatch",
  "procurement.view",
  "procurement.intake",
  "returns.view",
  "inventory.view",
  "tasks.view",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export type StaffPermissionGroup = {
  id: string;
  label: string;
  items: { key: StaffPermission; label: string; description: string }[];
};

export const STAFF_PERMISSION_GROUPS: StaffPermissionGroup[] = [
  {
    id: "orders",
    label: "Orders",
    items: [
      {
        key: "orders.view",
        label: "View orders",
        description: "See assigned catalog and wholesale orders",
      },
      {
        key: "orders.fulfill",
        label: "Fulfill / pick",
        description: "Update pick quantity and fulfillment status",
      },
      {
        key: "orders.create_on_behalf",
        label: "Create on behalf",
        description: "Place orders for a customer",
      },
      {
        key: "orders.rx",
        label: "Rx orders",
        description: "Work prescription / lab orders",
      },
      {
        key: "orders.dispatch",
        label: "Dispatch",
        description: "Set courier and tracking",
      },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    items: [
      {
        key: "procurement.view",
        label: "View procurement",
        description: "See the procurement queue and spend",
      },
      {
        key: "procurement.intake",
        label: "Stock intake",
        description: "Record procurement intake and fulfill waiting orders",
      },
    ],
  },
  {
    id: "returns",
    label: "Returns",
    items: [
      {
        key: "returns.view",
        label: "View returns",
        description: "Review assigned return requests (decisions stay admin-only)",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      {
        key: "inventory.view",
        label: "View stock",
        description: "See lens stock levels (catalog edits stay admin-only)",
      },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    items: [
      {
        key: "tasks.view",
        label: "View tasks",
        description: "See and complete assigned tasks",
      },
    ],
  },
];

export const ALL_STAFF_PERMISSIONS: StaffPermission[] = [...STAFF_PERMISSIONS];

export const STAFF_ROLE_SLUGS = {
  fullOperations: "full-operations",
  warehouse: "warehouse",
  dispatch: "dispatch",
  procurement: "procurement",
  returns: "returns",
} as const;

export type SystemStaffRoleSeed = {
  slug: string;
  name: string;
  description: string;
  permissions: StaffPermission[];
};

export const SYSTEM_STAFF_ROLE_SEEDS: SystemStaffRoleSeed[] = [
  {
    slug: STAFF_ROLE_SLUGS.fullOperations,
    name: "Full operations",
    description: "All staff modules. Default for existing employees.",
    permissions: ALL_STAFF_PERMISSIONS,
  },
  {
    slug: STAFF_ROLE_SLUGS.warehouse,
    name: "Warehouse",
    description: "Pick, pack, and view stock for assigned orders.",
    permissions: [
      "orders.view",
      "orders.fulfill",
      "inventory.view",
      "tasks.view",
    ],
  },
  {
    slug: STAFF_ROLE_SLUGS.dispatch,
    name: "Dispatch",
    description: "Ship assigned orders and add courier details.",
    permissions: ["orders.view", "orders.dispatch", "tasks.view"],
  },
  {
    slug: STAFF_ROLE_SLUGS.procurement,
    name: "Procurement",
    description: "Work the procurement queue and record stock intake.",
    permissions: [
      "orders.view",
      "procurement.view",
      "procurement.intake",
      "inventory.view",
      "tasks.view",
    ],
  },
  {
    slug: STAFF_ROLE_SLUGS.returns,
    name: "Returns",
    description: "Review assigned return and replacement requests.",
    permissions: ["orders.view", "returns.view", "tasks.view"],
  },
];

export function isStaffPermission(value: string): value is StaffPermission {
  return (STAFF_PERMISSIONS as readonly string[]).includes(value);
}

export function parsePermissionList(value: unknown): StaffPermission[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<StaffPermission>();
  for (const entry of value) {
    if (typeof entry === "string" && isStaffPermission(entry)) {
      unique.add(entry);
    }
  }
  return STAFF_PERMISSIONS.filter((key) => unique.has(key));
}

export function slugifyRoleName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "role";
}

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  key: StaffPermission
): boolean {
  return Array.isArray(permissions) && permissions.includes(key);
}
