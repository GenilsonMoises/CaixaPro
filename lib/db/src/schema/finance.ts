import {
  index,
  primaryKey,
  uniqueIndex,
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const categoriesTable = pgTable(
  "finance_categories",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerNameUnique: uniqueIndex("finance_categories_owner_name_unique").on(
      table.ownerId,
      sql`lower(${table.name})`,
    ),
  }),
);

export const responsiblesTable = pgTable(
  "finance_responsibles",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id"),
    name: text("name").notNull(),
    role: text("role"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerNameUnique: uniqueIndex("finance_responsibles_owner_name_unique").on(
      table.ownerId,
      sql`lower(${table.name})`,
    ),
  }),
);

export const movementsTable = pgTable(
  "finance_movements",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id"),
    movementCode: text("movement_code"),
    bankName: text("bank_name"),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type").notNull(),
    account: text("account").notNull(),
    destinationAccount: text("destination_account"),
    amountCents: integer("amount_cents").notNull(),
    category: text("category"),
    description: text("description").notNull(),
    responsible: text("responsible"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerCodeUnique: uniqueIndex("finance_movements_owner_code_unique").on(
      table.ownerId,
      table.movementCode,
    ),
    ownerDateIdx: index("finance_movements_owner_date_idx").on(
      table.ownerId,
      table.date,
      table.id,
    ),
  }),
);

export const financeSettingsTable = pgTable("finance_settings", {
  id: integer("id").primaryKey().default(1),
  bankOpeningBalanceCents: integer("bank_opening_balance_cents")
    .notNull()
    .default(0),
  cashOpeningBalanceCents: integer("cash_opening_balance_cents")
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const financeUserSettingsTable = pgTable("finance_user_settings", {
  userId: text("user_id").primaryKey(),
  bankOpeningBalanceCents: integer("bank_opening_balance_cents")
    .notNull()
    .default(0),
  cashOpeningBalanceCents: integer("cash_opening_balance_cents")
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const financeUserProfilesTable = pgTable(
  "finance_user_profiles",
  {
    userId: text("user_id").primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    displayNameIdx: index("finance_user_profiles_display_name_idx").on(
      table.displayName,
    ),
  }),
);

export const financeMovementCountersTable = pgTable(
  "finance_movement_counters",
  {
    userId: text("user_id").notNull(),
    prefix: text("prefix").notNull(),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.prefix, table.year],
    }),
  }),
);
