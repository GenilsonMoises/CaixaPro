import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("finance_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const responsiblesTable = pgTable("finance_responsibles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const movementsTable = pgTable("finance_movements", {
  id: serial("id").primaryKey(),
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
});

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
