import {
  createResponse,
  deconstructEvent,
  addItem,
  updateItem,
  getItem,
} from "./function_helpers";
import { randomUUID } from "crypto";

interface OrderRequest {
  items: any[];
  user_first_name: string;
  user_surname: string;
  club_account_id: string;
  user_id: string;
  total_amount: number;
  total_items: number;
  storage_request_id: string;
}

async function addToTransactionsTable(
  club_account_id: string,
  first_name: string,
  surname: string,
  transaction_id: string,
  user_id: string,
  order_amount: number,
  storage_request_id: string,
) {
  await addItem(process.env.TRANSACTIONS_TABLE_NAME as string, {
    club_account_id: club_account_id,
    name: `${first_name} ${surname}`,
    transaction_id: transaction_id,
    user_id: user_id as string,
    amount_paid: 0,
    club_income: true,
    amount: order_amount,
    creation_date: Date.now(),
    storage_request_id: storage_request_id,
    lifecycle: {
      [Date.now()]: {
        description: "Storage request submission",
        amount: order_amount,
        type: "SUBMISSION",
      },
    },
    type: "STORAGE",
    status: "PENDING",
  });
}

const createOrder = async (orderRequest: OrderRequest): Promise<string> => {
  const transaction_id = randomUUID();

  for (const item of orderRequest.items) {
    item["fulfillment_status"] = "NOT_PROCESSED";
    item["fulfillment_quantity"] = 0;
  }

  await addToTransactionsTable(
    orderRequest.club_account_id,
    orderRequest.user_first_name,
    orderRequest.user_surname,
    transaction_id,
    orderRequest.user_id as string,
    orderRequest.total_amount,
    orderRequest.storage_request_id,
  );

  return transaction_id;
};

const validateInput = (body: any) => {
  const storage_id = body?.storage_id ?? body?.storageId;
  const date = body?.date;
  const costCents = body?.costCents ?? body?.cost_cents;
  const paymentMethod = body?.paymentMethod ?? body?.payment_method;
  const paid = body?.paid;

  if (
    !storage_id ||
    typeof storage_id !== "string" ||
    storage_id.trim() === ""
  ) {
    return "storage_id is required and must be a non-empty string";
  }

  if (!date || typeof date !== "string" || isNaN(Date.parse(date))) {
    return "date is required and must be a valid date string (e.g. 2024-06-01)";
  }

  if (
    costCents === undefined ||
    typeof costCents !== "number" ||
    Number.isNaN(costCents) ||
    costCents < 0
  ) {
    return "costCents is required and must be a non-negative number";
  }

  if (
    !paymentMethod ||
    typeof paymentMethod !== "string" ||
    paymentMethod.trim() === ""
  ) {
    return "paymentMethod is required and must be a non-empty string";
  }

  if (paid !== undefined && typeof paid !== "boolean") {
    return "paid must be a boolean if provided";
  }

  return undefined;
};

const setStorageToNotAvailable = async (
  club_account_id: string,
  storage_id: string,
  booked_by_name: string,
) => {
  const tableName = process.env.STORAGE_TABLE_NAME as string;
  if (!tableName) {
    throw new Error("Server misconfigured: missing STORAGE_TABLE_NAME");
  }

  const key = { club_account_id, storage_id: storage_id };

  try {
    await updateItem(
      tableName,
      key,
      "SET #pending_booked = :pending_booked, #booked_by_name = :booked_by_name",
      {
        "#pending_booked": "pending_booked",
        "#booked_by_name": "booked_by_name",
      },
      {
        ":pending_booked": true,
        ":booked_by_name": booked_by_name,
      },
    );
  } catch (err: any) {
    console.error("Error setting storage to not available:", err);
    throw new Error(err.message ?? String(err));
  }
};

export const handler = async (event: any) => {
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    const validationErrors = validateInput(body);
    if (validationErrors) {
      return createResponse(400, { message: validationErrors }, origin);
    }

    const tableName = process.env.STORAGE_REQUESTS_TABLE as string;
    if (!tableName) {
      return createResponse(
        500,
        {
          message: "Server misconfigured: missing STORAGE_REQUESTS_TABLE",
        },
        origin,
      );
    }

    // Normalize inputs
    const storageTableName =
      (process.env.STORAGE_TABLE_NAME as string) ??
      (process.env.STORAGE_TABLE as string);
    const storage_request_id =
      body?.storage_request_id ?? body?.id ?? undefined;
    const storage_id = body?.storage_id ?? body?.storageId;
    const date = body?.date;
    const costCents = body?.costCents ?? body?.cost_cents;
    const paymentMethod = body?.paymentMethod ?? body?.payment_method;
    const paid = body?.paid ?? false;
    const paymentIntentId =
      body?.paymentIntentId ?? body?.payment_intent_id ?? null;
    const notes = body?.notes ?? null;
    const club_account_id = body?.club_account_id ?? body?.clubAccountId;
    const clubMemberTableName = process.env.CLUB_MEMBER_TABLE_NAME as string;

    if (!clubMemberTableName) {
      return createResponse(
        500,
        {
          message: "Server misconfigured: missing CLUB_MEMBER_TABLE_NAME",
        },
        origin,
      );
    }

    if (!storageTableName) {
      return createResponse(
        500,
        {
          message: "Server misconfigured: missing STORAGE_TABLE_NAME / STORAGE_TABLE",
        },
        origin,
      );
    }

    const club_member = await getItem(clubMemberTableName, {
      club_account_id: club_account_id,
      user_id: user_id as string,
    });

    if (!club_member) {
      return createResponse(
        403,
        { message: "User is not a member of the specified club." },
        origin,
      );
    }

    // Determine userId: prefer user_id from deconstructEvent
    const userId = user_id ?? body?.userId ?? body?.user_id;
    if (!userId || typeof userId !== "string") {
      return createResponse(
        400,
        { message: "userId is required (from JWT or request body)" },
        origin,
      );
    }

    const now = new Date().toISOString();
    const booked_by_name = `${club_member.member_first_name ?? ""} ${club_member.member_surname ?? ""}`.trim();

    // If storage_request_id provided -> update existing item
    if (storage_request_id) {
      // Build dynamic update expression for provided fields
      const updateParts: string[] = [];
      const exprNames: Record<string, string> = {};
      const exprValues: Record<string, any> = {};

      // Fields we allow updating
      // status
      if (body.status !== undefined) {
        updateParts.push("#status = :status");
        exprNames["#status"] = "status";
        exprValues[":status"] = body.status;
      }
      // date
      if (date !== undefined) {
        updateParts.push("#date = :date");
        exprNames["#date"] = "date";
        exprValues[":date"] = date;
      }
      // costCents
      if (costCents !== undefined) {
        updateParts.push("#costCents = :costCents");
        exprNames["#costCents"] = "costCents";
        exprValues[":costCents"] = costCents;
      }
      // paymentMethod
      if (paymentMethod !== undefined) {
        updateParts.push("#paymentMethod = :paymentMethod");
        exprNames["#paymentMethod"] = "paymentMethod";
        exprValues[":paymentMethod"] = paymentMethod;
      }
      // paid
      if (body.paid !== undefined) {
        updateParts.push("#paid = :paid");
        exprNames["#paid"] = "paid";
        exprValues[":paid"] = body.paid;
      }
      // paymentIntentId
      if (paymentIntentId !== undefined) {
        updateParts.push("#paymentIntentId = :paymentIntentId");
        exprNames["#paymentIntentId"] = "paymentIntentId";
        exprValues[":paymentIntentId"] = paymentIntentId;
      }
      // notes
      if (notes !== undefined) {
        updateParts.push("#notes = :notes");
        exprNames["#notes"] = "notes";
        exprValues[":notes"] = notes;
      }

      // Always update updatedAt
      updateParts.push("#updatedAt = :updatedAt");
      exprNames["#updatedAt"] = "updatedAt";
      exprValues[":updatedAt"] = now;

      if (updateParts.length === 0) {
        return createResponse(
          400,
          { message: "No updatable fields provided" },
          origin,
        );
      }

      const updateExpression = `SET ${updateParts.join(", ")}`;

      try {
        await updateItem(
          tableName,
          { storage_request_id },
          updateExpression,
          exprNames,
          exprValues,
          "attribute_exists(storage_request_id)", // ensure item exists
          false, // don't return values
        );

        return createResponse(
          200,
          {
            message: "Successfully updated storage request",
            storage_request_id,
          },
          origin,
        );
      } catch (err: any) {
        console.error("Error updating storage request:", err);
        if (err?.name === "ConditionalCheckFailedException") {
          return createResponse(
            404,
            { message: "Storage request not found" },
            origin,
          );
        }
        return createResponse(
          500,
          { message: err.message ?? String(err) },
          origin,
        );
      }
    }

    const storage_unit = await getItem(storageTableName, {
      club_account_id,
      storage_id,
    });

    if (!storage_unit) {
      return createResponse(404, { message: "Storage unit not found" }, origin);
    }

    const parent_id = storage_unit.parent_id ?? null;
    let parent_storage_name = null;

    if (typeof parent_id === "string" && parent_id.trim() !== "") {
      const parent_storage_unit = await getItem(storageTableName, {
        club_account_id,
        storage_id: parent_id,
      });

      parent_storage_name = parent_storage_unit?.storage_name ?? null;
    }

    // Create new storage request
    const newId = randomUUID();
    const item = {
      storage_request_id: newId,
      club_account_id,
      storage_id,
      storage_name: storage_unit.storage_name ?? null,
      parent_id,
      parent_storage_name,
      user_first_name: club_member.member_first_name,
      user_surname: club_member.member_surname,
      userId,
      date,
      status: "pending",
      costCents,
      paymentMethod,
      paid,
      paymentIntentId,
      notes,
      createdAt: now,
      updatedAt: now,
      transaction_id: "",
    };

    try {
      const transaction_id = await createOrder({
        items: [
          {
            type: "STORAGE",
            storage_id: item.storage_id,
            storage_request_id: item.storage_request_id,
          },
        ],
        user_first_name: club_member.member_first_name,
        user_surname: club_member.member_surname,
        club_account_id: item.club_account_id,
        user_id: item.userId,
        total_amount: item.costCents,
        total_items: 1,
        storage_request_id: item.storage_request_id,
      });

      item.transaction_id = transaction_id;

      await addItem(
        tableName,
        item,
        "attribute_not_exists(storage_request_id)",
      );

      // Set storage to booked (isBooked = true) so it no longer appears available in list_storage function or disabled for purchasing
      await setStorageToNotAvailable(club_account_id, storage_id, booked_by_name);

      return createResponse(
        200,
        {
          message: "Successfully created storage request",
          storage_request_id: newId,
        },
        origin,
      );
    } catch (err: any) {
      console.error("Error creating storage request:", err);
      if (err?.name === "ConditionalCheckFailedException") {
        return createResponse(
          409,
          { message: "Storage request with that id already exists" },
          origin,
        );
      }
      return createResponse(
        500,
        { message: err.message ?? String(err) },
        origin,
      );
    }
  } catch (error: any) {
    console.error("Unhandled error in create_storage_request:", error);
    return createResponse(
      500,
      { message: error.message ?? String(error) },
      origin,
    );
  }
};
