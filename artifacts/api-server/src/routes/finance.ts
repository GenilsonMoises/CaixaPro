import { Router, type IRouter, type Response } from "express";
import { asc, eq, sql } from "drizzle-orm";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  CreateResponsibleBody,
  CreateResponsibleResponse,
  CreateMovementBody,
  CreateMovementResponse,
  DeleteCategoryParams,
  DeleteMovementParams,
  DeleteResponsibleParams,
  GetOverviewQueryParams,
  GetOverviewResponse,
  GetSettingsResponse,
  ListCategoriesResponse,
  ListMovementsQueryParams,
  ListMovementsResponse,
  ListResponsiblesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
  UpdateMovementBody,
  UpdateMovementParams,
  UpdateMovementResponse,
  UpdateResponsibleBody,
  UpdateResponsibleParams,
  UpdateResponsibleResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import {
  categoriesTable,
  db,
  financeSettingsTable,
  movementsTable,
  responsiblesTable,
} from "@workspace/db";

const router: IRouter = Router();
const DEFAULT_CATEGORIES = [
  "Alimentação",
  "Compras",
  "Comunicação",
  "Contas",
  "Impostos",
  "Manutenção",
  "Material",
  "Outros",
  "Recebimento",
  "Salários",
  "Serviços",
  "Transporte",
];

type MovementRow = typeof movementsTable.$inferSelect;
type Account = "bank" | "cash";
type FinanceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FilterValues = {
  startDate?: Date;
  endDate?: Date;
  search?: string;
  type?: "income" | "expense" | "transfer";
  category?: string;
  responsible?: string;
  account?: Account;
};

class LedgerConflictError extends Error {
  constructor(account: Account, date: string) {
    super(
      `O movimento deixaria o saldo de ${account === "bank" ? "Banco" : "Caixa"} negativo em ${date}.`,
    );
    this.name = "LedgerConflictError";
  }
}

function responseError(
  res: Response,
  status: number,
  message: string,
): void {
  res.status(status).json({ error: message });
}

function parseDateFilter(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return undefined;
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseFilters(
  query: Record<string, unknown>,
  schema: typeof ListMovementsQueryParams | typeof GetOverviewQueryParams,
): FilterValues | null {
  if (
    (query.startDate !== undefined && !parseDateFilter(query.startDate)) ||
    (query.endDate !== undefined && !parseDateFilter(query.endDate))
  ) {
    return null;
  }
  const raw = {
    ...query,
    startDate: query.startDate ? parseDateFilter(query.startDate) : undefined,
    endDate: query.endDate ? parseDateFilter(query.endDate) : undefined,
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;
  const values = parsed.data as FilterValues;
  if (
    values.startDate &&
    values.endDate &&
    values.startDate.getTime() > values.endDate.getTime()
  ) {
    return null;
  }
  return values;
}

function inFilterRange(row: MovementRow, filters: FilterValues): boolean {
  if (filters.startDate && row.date < filters.startDate.toISOString().slice(0, 10)) {
    return false;
  }
  if (filters.endDate && row.date > filters.endDate.toISOString().slice(0, 10)) {
    return false;
  }
  if (filters.type && row.type !== filters.type) return false;
  if (
    filters.category &&
    (row.category ?? "").toLocaleLowerCase() !==
      filters.category.toLocaleLowerCase()
  ) {
    return false;
  }
  if (
    filters.responsible &&
    (row.responsible ?? "").toLocaleLowerCase() !==
      filters.responsible.toLocaleLowerCase()
  ) {
    return false;
  }
  if (
    filters.account &&
    row.account !== filters.account &&
    row.destinationAccount !== filters.account
  ) {
    return false;
  }
  if (filters.search) {
    const needle = filters.search.trim().toLocaleLowerCase();
    const haystack = [
      row.date,
      row.type,
      row.account,
      row.destinationAccount,
      row.amountCents,
      (row.amountCents / 100).toLocaleString("pt-AO"),
      row.category,
      row.description,
      row.responsible,
      row.note,
    ]
      .filter((value) => value != null)
      .join(" ")
      .toLocaleLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function applyMovement(
  balances: Record<Account, number>,
  movement: MovementRow,
): void {
  if (movement.type === "income") {
    balances[movement.account as Account] += movement.amountCents;
  } else if (movement.type === "expense") {
    balances[movement.account as Account] -= movement.amountCents;
  } else {
    const source = movement.account as Account;
    const destination = movement.destinationAccount as Account;
    balances[source] -= movement.amountCents;
    balances[destination] += movement.amountCents;
  }
}

function validateLedger(
  settings: {
    bankOpeningBalanceCents: number;
    cashOpeningBalanceCents: number;
  },
  rows: MovementRow[],
): LedgerConflictError | null {
  const balances: Record<Account, number> = {
    bank: settings.bankOpeningBalanceCents,
    cash: settings.cashOpeningBalanceCents,
  };
  for (const row of [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  )) {
    applyMovement(balances, row);
    if (balances.bank < 0) return new LedgerConflictError("bank", row.date);
    if (balances.cash < 0) return new LedgerConflictError("cash", row.date);
  }
  return null;
}

async function lockSettings(tx: FinanceTx) {
  await tx
    .insert(financeSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [settings] = await tx
    .select()
    .from(financeSettingsTable)
    .where(eq(financeSettingsTable.id, 1))
    .for("update");
  return settings;
}

async function seedDefaultCategories(): Promise<void> {
  await db
    .insert(categoriesTable)
    .values(DEFAULT_CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing();
}

function movementDateToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function movementValues(
  data: {
    date?: Date;
    type?: "income" | "expense" | "transfer";
    account?: Account;
    destinationAccount?: Account | null;
    amountCents?: number;
    category?: string | null;
    description?: string;
    responsible?: string | null;
    note?: string | null;
  },
  current?: MovementRow,
) {
  const merged = {
    date: data.date ? movementDateToString(data.date) : current?.date,
    type: data.type ?? current?.type,
    account: data.account ?? current?.account,
    destinationAccount:
      data.destinationAccount !== undefined
        ? data.destinationAccount
        : current?.destinationAccount ?? null,
    amountCents: data.amountCents ?? current?.amountCents,
    category:
      data.category !== undefined
        ? data.category?.trim() || null
        : current?.category ?? null,
    description: data.description?.trim() ?? current?.description,
    responsible:
      data.responsible !== undefined
        ? data.responsible
        : current?.responsible ?? null,
    note: data.note !== undefined ? data.note : current?.note ?? null,
  };
  if (
    !merged.date ||
    !merged.type ||
    !merged.account ||
    !merged.amountCents ||
    !merged.description
  ) {
    throw new Error("Preencha os campos obrigatórios.");
  }
  if (merged.type !== "transfer" && !merged.category?.trim()) {
    throw new Error("A categoria é obrigatória para entradas e saídas.");
  }
  if (
    merged.type === "transfer" &&
    (!merged.destinationAccount ||
      merged.destinationAccount === merged.account)
  ) {
    throw new Error("Escolha uma conta de destino diferente da origem.");
  }
  if (merged.type !== "transfer" && merged.destinationAccount) {
    throw new Error("Apenas transferências podem ter uma conta de destino.");
  }
  return merged as typeof movementsTable.$inferInsert;
}

function isLedgerConflict(error: unknown): error is LedgerConflictError {
  return error instanceof LedgerConflictError;
}

router.get("/categories", async (_req, res): Promise<void> => {
  await seedDefaultCategories();
  const rows = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.name));
  res.json(ListCategoriesResponse.parse(rows));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    responseError(res, 400, parsed.error.message);
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    responseError(res, 400, "O nome da categoria é obrigatório.");
    return;
  }
  const [duplicate] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(sql`lower(${categoriesTable.name}) = lower(${name})`)
    .limit(1);
  if (duplicate) {
    responseError(res, 400, "Esta categoria já existe.");
    return;
  }
  const [created] = await db
    .insert(categoriesTable)
    .values({ name })
    .returning();
  res.status(201).json(CreateCategoryResponse.parse(created));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  const body = UpdateCategoryBody.safeParse(req.body);
  if (!params.success || !body.success) {
    responseError(res, 400, "Dados inválidos para atualizar a categoria.");
    return;
  }
  const name = body.data.name.trim();
  if (!name) {
    responseError(res, 400, "O nome da categoria é obrigatório.");
    return;
  }
  const [existing] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    responseError(res, 404, "Categoria não encontrada.");
    return;
  }
  const [duplicate] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(sql`lower(${categoriesTable.name}) = lower(${name})`)
    .limit(1);
  if (duplicate && duplicate.id !== existing.id) {
    responseError(res, 400, "Esta categoria já existe.");
    return;
  }
  const [updated] = await db
    .update(categoriesTable)
    .set({ name })
    .where(eq(categoriesTable.id, params.data.id))
    .returning();
  if (existing.name !== name) {
    await db
      .update(movementsTable)
      .set({ category: name })
      .where(eq(movementsTable.category, existing.name));
  }
  res.json(UpdateCategoryResponse.parse(updated));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    responseError(res, 400, params.error.message);
    return;
  }
  const [deleted] = await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    responseError(res, 404, "Categoria não encontrada.");
    return;
  }
  res.sendStatus(204);
});

router.get("/responsibles", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(responsiblesTable)
    .orderBy(asc(responsiblesTable.name));
  res.json(ListResponsiblesResponse.parse(rows));
});

router.post("/responsibles", async (req, res): Promise<void> => {
  const parsed = CreateResponsibleBody.safeParse(req.body);
  if (!parsed.success) {
    responseError(res, 400, parsed.error.message);
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    responseError(res, 400, "O nome do responsável é obrigatório.");
    return;
  }
  const [created] = await db
    .insert(responsiblesTable)
    .values({
      name,
      role: parsed.data.role?.trim() || null,
      active: parsed.data.active ?? true,
    })
    .returning();
  res.status(201).json(CreateResponsibleResponse.parse(created));
});

router.patch("/responsibles/:id", async (req, res): Promise<void> => {
  const params = UpdateResponsibleParams.safeParse(req.params);
  const body = UpdateResponsibleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    responseError(res, 400, "Dados inválidos para atualizar o responsável.");
    return;
  }
  const [existing] = await db
    .select()
    .from(responsiblesTable)
    .where(eq(responsiblesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    responseError(res, 404, "Responsável não encontrado.");
    return;
  }
  const name = body.data.name?.trim();
  if (body.data.name !== undefined && !name) {
    responseError(res, 400, "O nome do responsável é obrigatório.");
    return;
  }
  const [updated] = await db
    .update(responsiblesTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(body.data.role !== undefined
        ? { role: body.data.role?.trim() || null }
        : {}),
      ...(body.data.active !== undefined ? { active: body.data.active } : {}),
    })
    .where(eq(responsiblesTable.id, params.data.id))
    .returning();
  if (name && name !== existing.name) {
    await db
      .update(movementsTable)
      .set({ responsible: name })
      .where(eq(movementsTable.responsible, existing.name));
  }
  res.json(UpdateResponsibleResponse.parse(updated));
});

router.delete("/responsibles/:id", async (req, res): Promise<void> => {
  const params = DeleteResponsibleParams.safeParse(req.params);
  if (!params.success) {
    responseError(res, 400, params.error.message);
    return;
  }
  const [existing] = await db
    .select()
    .from(responsiblesTable)
    .where(eq(responsiblesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    responseError(res, 404, "Responsável não encontrado.");
    return;
  }
  await db
    .delete(responsiblesTable)
    .where(eq(responsiblesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/movements", async (req, res): Promise<void> => {
  const filters = parseFilters(
    req.query as Record<string, unknown>,
    ListMovementsQueryParams,
  );
  if (!filters) {
    responseError(res, 400, "Filtros inválidos. Verifique o intervalo de datas.");
    return;
  }
  const rows = await db
    .select()
    .from(movementsTable)
    .orderBy(asc(movementsTable.date), asc(movementsTable.id));
  const results = rows
    .filter((row) => inFilterRange(row, filters))
    .reverse();
  res.json(ListMovementsResponse.parse(results));
});

router.post("/movements", async (req, res): Promise<void> => {
  const parsed = CreateMovementBody.safeParse(req.body);
  if (!parsed.success) {
    responseError(res, 400, parsed.error.message);
    return;
  }
  let values: ReturnType<typeof movementValues>;
  try {
    values = movementValues(parsed.data);
  } catch (error) {
    responseError(
      res,
      400,
      error instanceof Error ? error.message : "Lançamento inválido.",
    );
    return;
  }
  try {
    const created = await db.transaction(async (tx) => {
      const settings = await lockSettings(tx);
      const [row] = await tx
        .insert(movementsTable)
        .values(values)
        .returning();
      const allRows = await tx
        .select()
        .from(movementsTable)
        .orderBy(asc(movementsTable.date), asc(movementsTable.id));
      const conflict = validateLedger(settings, allRows);
      if (conflict) throw conflict;
      return row;
    });
    res.status(201).json(CreateMovementResponse.parse(created));
  } catch (error) {
    if (isLedgerConflict(error)) {
      responseError(res, 400, error.message);
      return;
    }
    throw error;
  }
});

router.patch("/movements/:id", async (req, res): Promise<void> => {
  const params = UpdateMovementParams.safeParse(req.params);
  const body = UpdateMovementBody.safeParse(req.body);
  if (!params.success || !body.success) {
    responseError(res, 400, "Dados inválidos para atualizar o lançamento.");
    return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const settings = await lockSettings(tx);
      const [current] = await tx
        .select()
        .from(movementsTable)
        .where(eq(movementsTable.id, params.data.id))
        .limit(1);
      if (!current) return null;
      const values = movementValues(body.data, current);
      const [row] = await tx
        .update(movementsTable)
        .set(values)
        .where(eq(movementsTable.id, params.data.id))
        .returning();
      const allRows = await tx
        .select()
        .from(movementsTable)
        .orderBy(asc(movementsTable.date), asc(movementsTable.id));
      const conflict = validateLedger(settings, allRows);
      if (conflict) throw conflict;
      return row;
    });
    if (!updated) {
      responseError(res, 404, "Lançamento não encontrado.");
      return;
    }
    res.json(UpdateMovementResponse.parse(updated));
  } catch (error) {
    if (isLedgerConflict(error)) {
      responseError(res, 400, error.message);
      return;
    }
    if (
      error instanceof Error &&
      (error.message.startsWith("Apenas transferências") ||
        error.message.startsWith("Escolha uma conta") ||
        error.message.startsWith("A categoria") ||
        error.message.startsWith("Preencha"))
    ) {
      responseError(res, 400, error.message);
      return;
    }
    throw error;
  }
});

router.delete("/movements/:id", async (req, res): Promise<void> => {
  const params = DeleteMovementParams.safeParse(req.params);
  if (!params.success) {
    responseError(res, 400, params.error.message);
    return;
  }
  try {
    const deleted = await db.transaction(async (tx) => {
      const settings = await lockSettings(tx);
      const [row] = await tx
        .delete(movementsTable)
        .where(eq(movementsTable.id, params.data.id))
        .returning();
      if (!row) return null;
      const allRows = await tx
        .select()
        .from(movementsTable)
        .orderBy(asc(movementsTable.date), asc(movementsTable.id));
      const conflict = validateLedger(settings, allRows);
      if (conflict) throw conflict;
      return row;
    });
    if (!deleted) {
      responseError(res, 404, "Lançamento não encontrado.");
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    if (isLedgerConflict(error)) {
      responseError(res, 400, error.message);
      return;
    }
    throw error;
  }
});

router.get("/overview", async (req, res): Promise<void> => {
  const filters = parseFilters(
    req.query as Record<string, unknown>,
    GetOverviewQueryParams,
  );
  if (!filters) {
    responseError(res, 400, "Filtros inválidos. Verifique o intervalo de datas.");
    return;
  }
  await db
    .insert(financeSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(financeSettingsTable)
    .where(eq(financeSettingsTable.id, 1))
    .limit(1);
  const rows = await db
    .select()
    .from(movementsTable)
    .orderBy(asc(movementsTable.date), asc(movementsTable.id));
  const selected = rows.filter((row) => inFilterRange(row, filters));
  const totals = {
    bank: { incomeCents: 0, expenseCents: 0, balanceCents: 0 },
    cash: { incomeCents: 0, expenseCents: 0, balanceCents: 0 },
  };
  let incomeCents = 0;
  let expenseCents = 0;
  const daily = new Map<string, { incomeCents: number; expenseCents: number }>();
  const expenses = new Map<string, number>();

  for (const row of selected) {
    if (row.type === "income" || row.type === "expense") {
      const account = row.account as Account;
      if (row.type === "income") {
        totals[account].incomeCents += row.amountCents;
        incomeCents += row.amountCents;
        const day = daily.get(row.date) ?? {
          incomeCents: 0,
          expenseCents: 0,
        };
        day.incomeCents += row.amountCents;
        daily.set(row.date, day);
      } else {
        totals[account].expenseCents += row.amountCents;
        expenseCents += row.amountCents;
        const category = row.category || "Sem categoria";
        expenses.set(category, (expenses.get(category) ?? 0) + row.amountCents);
        const day = daily.get(row.date) ?? {
          incomeCents: 0,
          expenseCents: 0,
        };
        day.expenseCents += row.amountCents;
        daily.set(row.date, day);
      }
    }
  }

  const balanceRows = filters.endDate
    ? rows.filter(
        (row) =>
          row.date <= filters.endDate!.toISOString().slice(0, 10),
      )
    : rows;
  const actualBalances: Record<Account, number> = {
    bank: settings?.bankOpeningBalanceCents ?? 0,
    cash: settings?.cashOpeningBalanceCents ?? 0,
  };
  for (const row of balanceRows) applyMovement(actualBalances, row);
  totals.bank.balanceCents = actualBalances.bank;
  totals.cash.balanceCents = actualBalances.cash;
  const totalExpenseByCategory = [...expenses.values()].reduce(
    (total, value) => total + value,
    0,
  );
  const payload = {
    ...totals,
    totalAvailableCents: actualBalances.bank + actualBalances.cash,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    movementCount: selected.length,
    dailyFlow: [...daily.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, value]) => ({ date, ...value })),
    expensesByCategory: [...expenses.entries()]
      .map(([category, amountCents]) => ({
        category,
        amountCents,
        percentage:
          totalExpenseByCategory === 0
            ? 0
            : (amountCents / totalExpenseByCategory) * 100,
      }))
      .sort((a, b) => b.amountCents - a.amountCents),
    recentMovements: selected.slice(-8).reverse(),
    updatedAt: new Date(),
  };
  res.json(GetOverviewResponse.parse(payload));
});

router.get("/settings", async (_req, res): Promise<void> => {
  await db
    .insert(financeSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(financeSettingsTable)
    .where(eq(financeSettingsTable.id, 1))
    .limit(1);
  res.json(GetSettingsResponse.parse(settings));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    responseError(res, 400, parsed.error.message);
    return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const current = await lockSettings(tx);
      const rows = await tx
        .select()
        .from(movementsTable)
        .orderBy(asc(movementsTable.date), asc(movementsTable.id));
      const proposed = {
        bankOpeningBalanceCents: parsed.data.bankOpeningBalanceCents,
        cashOpeningBalanceCents: parsed.data.cashOpeningBalanceCents,
      };
      const conflict = validateLedger(proposed, rows);
      if (conflict) throw conflict;
      const [result] = await tx
        .update(financeSettingsTable)
        .set({ ...proposed, updatedAt: new Date() })
        .where(eq(financeSettingsTable.id, current.id))
        .returning();
      return result;
    });
    res.json(UpdateSettingsResponse.parse(updated));
  } catch (error) {
    if (isLedgerConflict(error)) {
      responseError(res, 400, error.message);
      return;
    }
    throw error;
  }
});

export default router;
