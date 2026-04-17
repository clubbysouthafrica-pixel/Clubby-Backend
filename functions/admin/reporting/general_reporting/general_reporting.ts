import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

type IncomeType = "registration" | "event_registration" | "shop" | "storage";

type MonthlyEntry = {
    date: string;
    total_revenue: number;
    total_pending_revenue: number;
};

type LifecycleEntry = {
    amount?: number;
    type?: string;
};

type PendingBucket = {
    timestamp: number;
    amount: number;
};

type TransactionItem = {
    creation_date?: number;
    club_income?: boolean;
    status?: string;
    type?: string;
    lifecycle?: Record<string, LifecycleEntry>;
};

type Report = {
    total_revenue: number;
    total_pending_revenue: number;
    total_expense: number;
    total_registration_revenue: number;
    total_registration_pending_revenue: number;
    total_event_registration_revenue: number;
    total_event_registration_pending_revenue: number;
    total_shop_revenue: number;
    total_shop_pending_revenue: number;
    total_storage_revenue: number;
    total_storage_pending_revenue: number;
    data: MonthlyEntry[];
    registration_data: MonthlyEntry[];
    event_registration_data: MonthlyEntry[];
    shop_data: MonthlyEntry[];
    storage_data: MonthlyEntry[];
    expense_data: ExpenseMonthlyEntry[];
    expense_type_data: ExpenseTypeReport[];
};

type ExpenseMonthlyEntry = {
    date: string;
    total_expense: number;
};

type ExpenseTypeReport = {
    type: string;
    total_expense: number;
    data: ExpenseMonthlyEntry[];
};

const INCOME_TYPE_MAP: Record<string, IncomeType | undefined> = {
    "REGISTRATION": "registration",
    "EVENT REGISTRATION": "event_registration",
    "ORDER": "shop",
    "STORAGE": "storage",
};

function formatToYearMonth(timestamp: number): string {
    const date = new Date(timestamp);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${date.getFullYear()} ${monthNames[date.getMonth()]}`;
}

function createMonthlyEntry(date: string): MonthlyEntry {
    return {
        date,
        total_revenue: 0,
        total_pending_revenue: 0,
    };
}

function createExpenseMonthlyEntry(date: string): ExpenseMonthlyEntry {
    return {
        date,
        total_expense: 0,
    };
}

function createReport(): Report {
    return {
        total_revenue: 0,
        total_pending_revenue: 0,
        total_expense: 0,
        total_registration_revenue: 0,
        total_registration_pending_revenue: 0,
        total_event_registration_revenue: 0,
        total_event_registration_pending_revenue: 0,
        total_shop_revenue: 0,
        total_shop_pending_revenue: 0,
        total_storage_revenue: 0,
        total_storage_pending_revenue: 0,
        data: [],
        registration_data: [],
        event_registration_data: [],
        shop_data: [],
        storage_data: [],
        expense_data: [],
        expense_type_data: [],
    };
}

function sortMonthlyEntries(entries: MonthlyEntry[]): MonthlyEntry[] {
    return entries.sort((left, right) => {
        const leftDate = new Date(`${left.date} 01`);
        const rightDate = new Date(`${right.date} 01`);
        return leftDate.getTime() - rightDate.getTime();
    });
}

function getTypeKey(type: IncomeType): keyof Report {
    switch (type) {
        case "registration":
            return "registration_data";
        case "event_registration":
            return "event_registration_data";
        case "shop":
            return "shop_data";
        case "storage":
            return "storage_data";
    }
}

function getOrCreateMonthlyEntry(entries: MonthlyEntry[], date: string): MonthlyEntry {
    let entry = entries.find(item => item.date === date);
    if (!entry) {
        entry = createMonthlyEntry(date);
        entries.push(entry);
    }
    return entry;
}

function getOrCreateExpenseMonthlyEntry(entries: ExpenseMonthlyEntry[], date: string): ExpenseMonthlyEntry {
    let entry = entries.find(item => item.date === date);
    if (!entry) {
        entry = createExpenseMonthlyEntry(date);
        entries.push(entry);
    }
    return entry;
}

function getOrCreateExpenseTypeReport(report: Report, type: string): ExpenseTypeReport {
    let entry = report.expense_type_data.find(item => item.type === type);
    if (!entry) {
        entry = {
            type,
            total_expense: 0,
            data: [],
        };
        report.expense_type_data.push(entry);
    }
    return entry;
}

function applyDelta(report: Report, incomeType: IncomeType, timestamp: number, revenueDelta: number, pendingDelta: number) {
    const date = formatToYearMonth(timestamp);
    const overallEntry = getOrCreateMonthlyEntry(report.data, date);
    const typeEntry = getOrCreateMonthlyEntry(report[getTypeKey(incomeType)] as MonthlyEntry[], date);

    overallEntry.total_revenue += revenueDelta;
    overallEntry.total_pending_revenue += pendingDelta;

    typeEntry.total_revenue += revenueDelta;
    typeEntry.total_pending_revenue += pendingDelta;

    report.total_revenue += revenueDelta;
    report.total_pending_revenue += pendingDelta;

    switch (incomeType) {
        case "registration":
            report.total_registration_revenue += revenueDelta;
            report.total_registration_pending_revenue += pendingDelta;
            break;
        case "event_registration":
            report.total_event_registration_revenue += revenueDelta;
            report.total_event_registration_pending_revenue += pendingDelta;
            break;
        case "shop":
            report.total_shop_revenue += revenueDelta;
            report.total_shop_pending_revenue += pendingDelta;
            break;
        case "storage":
            report.total_storage_revenue += revenueDelta;
            report.total_storage_pending_revenue += pendingDelta;
            break;
    }
}

function applyExpenseDelta(report: Report, type: string, timestamp: number, expenseDelta: number) {
    const date = formatToYearMonth(timestamp);
    const overallEntry = getOrCreateExpenseMonthlyEntry(report.expense_data, date);
    const typeReport = getOrCreateExpenseTypeReport(report, type);
    const typeEntry = getOrCreateExpenseMonthlyEntry(typeReport.data, date);

    overallEntry.total_expense += expenseDelta;

    typeEntry.total_expense += expenseDelta;

    report.total_expense += expenseDelta;

    typeReport.total_expense += expenseDelta;
}

function consumePendingBuckets(report: Report, incomeType: IncomeType, pendingBuckets: PendingBucket[], amountToConsume: number) {
    let remainingAmount = amountToConsume;

    for (const bucket of pendingBuckets) {
        if (remainingAmount <= 0) {
            break;
        }

        const consumedAmount = Math.min(bucket.amount, remainingAmount);
        if (consumedAmount <= 0) {
            continue;
        }

        applyDelta(report, incomeType, bucket.timestamp, 0, -consumedAmount);
        bucket.amount -= consumedAmount;
        remainingAmount -= consumedAmount;
    }

    return amountToConsume - remainingAmount;
}

function processLifecycleEntry(report: Report, incomeType: IncomeType, timestamp: number, lifecycleEntry: LifecycleEntry, pendingBuckets: PendingBucket[], currentPending: number) {
    const parsedAmount = Number(lifecycleEntry?.amount ?? 0);
    const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

    switch (lifecycleEntry?.type) {
        case "SUBMISSION": {
            if (!hasValidAmount) {
                return currentPending;
            }
            applyDelta(report, incomeType, timestamp, 0, parsedAmount);
            pendingBuckets.push({ timestamp, amount: parsedAmount });
            return currentPending + parsedAmount;
        }
        case "CONFIRMATION": {
            if (!hasValidAmount) {
                return currentPending;
            }
            const settledAmount = Math.min(parsedAmount, currentPending);
            applyDelta(report, incomeType, timestamp, parsedAmount, 0);
            consumePendingBuckets(report, incomeType, pendingBuckets, settledAmount);
            return currentPending - settledAmount;
        }
        case "REFUND": {
            if (!hasValidAmount) {
                return currentPending;
            }
            const pendingReduction = Math.min(parsedAmount, currentPending);
            applyDelta(report, incomeType, timestamp, -parsedAmount, 0);
            consumePendingBuckets(report, incomeType, pendingBuckets, pendingReduction);
            return currentPending - pendingReduction;
        }
        case "CANCELLATION": {
            const cancellationAmount = hasValidAmount ? Math.min(parsedAmount, currentPending) : currentPending;
            if (cancellationAmount === 0) {
                return currentPending;
            }
            consumePendingBuckets(report, incomeType, pendingBuckets, cancellationAmount);
            return currentPending - cancellationAmount;
        }
        default:
            return currentPending;
    }
}

function processExpenseLifecycleEntry(report: Report, type: string, timestamp: number, lifecycleEntry: LifecycleEntry) {
    const parsedAmount = Number(lifecycleEntry?.amount ?? 0);
    const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

    if (!hasValidAmount) {
        return;
    }

    switch (lifecycleEntry?.type) {
        case "SUBMISSION":
        case "CANCELLATION":
            return;
        case "CONFIRMATION": {
            applyExpenseDelta(report, type, timestamp, parsedAmount);
            return;
        }
        case "REFUND": {
            applyExpenseDelta(report, type, timestamp, -parsedAmount);
            return;
        }
        default:
            return;
    }
}

function processTransactions(report: Report, transactions: TransactionItem[]) {
    transactions.forEach(transaction => {
        if (transaction?.club_income !== true) {
            return;
        }

        const incomeType = INCOME_TYPE_MAP[transaction?.type ?? ""];
        if (!incomeType) {
            return;
        }

        const lifecycleEntries = Object.entries(transaction?.lifecycle ?? {})
            .map(([timestamp, entry]) => ({
                timestamp: Number(timestamp),
                entry,
            }))
            .filter(item => Number.isFinite(item.timestamp))
            .sort((left, right) => left.timestamp - right.timestamp);

        const pendingBuckets: PendingBucket[] = [];
        let currentPending = 0;
        lifecycleEntries.forEach(item => {
            currentPending = processLifecycleEntry(report, incomeType, item.timestamp, item.entry, pendingBuckets, currentPending);
        });

        if (transaction?.status === "CANCELLED" && currentPending > 0) {
            consumePendingBuckets(report, incomeType, pendingBuckets, currentPending);
        }
    });

    sortMonthlyEntries(report.data);
    sortMonthlyEntries(report.registration_data);
    sortMonthlyEntries(report.event_registration_data);
    sortMonthlyEntries(report.shop_data);
    sortMonthlyEntries(report.storage_data);

    return report;
}

function processExpenseTransactions(report: Report, transactions: TransactionItem[]) {
    transactions.forEach(transaction => {
        if (transaction?.club_income !== false) {
            return;
        }

        const expenseType = transaction?.type ?? "UNKNOWN";
        const lifecycleEntries = Object.entries(transaction?.lifecycle ?? {})
            .map(([timestamp, entry]) => ({
                timestamp: Number(timestamp),
                entry,
            }))
            .filter(item => Number.isFinite(item.timestamp))
            .sort((left, right) => left.timestamp - right.timestamp);

        lifecycleEntries.forEach(item => {
            processExpenseLifecycleEntry(report, expenseType, item.timestamp, item.entry);
        });
    });

    sortMonthlyEntries(report.expense_data as unknown as MonthlyEntry[]);
    report.expense_type_data.forEach(entry => {
        sortMonthlyEntries(entry.data as unknown as MonthlyEntry[]);
    });
    report.expense_type_data.sort((left, right) => left.type.localeCompare(right.type));

    return report;
}

export const handler = async (event: any) => {
    const { origin, query_string_params } = deconstructEvent(event);

    try {
        if (!query_string_params?.club_account_id) {
            return createResponse(400, { message: "club_account_id is required." }, origin);
        }

        const transactions = await queryItems(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        );

        const report = createReport();
        processTransactions(report, transactions ?? []);
        processExpenseTransactions(report, transactions ?? []);

        return createResponse(200, report, origin);

    } catch (error: any) {
        console.error("General reporting error:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
