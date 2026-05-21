import {
  createResponse,
  deconstructEvent,
  getItem,
  updateItem,
} from "./function_helpers";

const validateUpdatableFields = (body: any) => {
  if (!body) return "Request body is required";

  const id = body?.storage_request_id ?? body?.id;
  if (!id || typeof id !== "string" || id.trim() === "") {
    return "storage_request_id (or id) is required and must be a non-empty string";
  }

  // Validate types for provided fields
  if (body.status !== undefined && typeof body.status !== "string") {
    return "status must be a string if provided";
  }
  if (body.paid !== undefined && typeof body.paid !== "boolean") {
    return "paid must be a boolean if provided";
  }
  if (
    body.costCents !== undefined &&
    (typeof body.costCents !== "number" ||
      Number.isNaN(body.costCents) ||
      body.costCents < 0)
  ) {
    return "costCents must be a non-negative number if provided";
  }
  if (
    body.paymentMethod !== undefined &&
    typeof body.paymentMethod !== "string"
  ) {
    return "paymentMethod must be a string if provided";
  }
  if (
    body.paymentIntentId !== undefined &&
    body.paymentIntentId !== null &&
    typeof body.paymentIntentId !== "string"
  ) {
    return "paymentIntentId must be a string or null if provided";
  }
  if (
    body.notes !== undefined &&
    body.notes !== null &&
    typeof body.notes !== "string"
  ) {
    return "notes must be a string or null if provided";
  }
  if (
    body.date !== undefined &&
    (typeof body.date !== "string" || isNaN(Date.parse(body.date)))
  ) {
    return "date must be a valid date string if provided";
  }
  if (body.userId !== undefined && typeof body.userId !== "string") {
    return "userId must be a string if provided";
  }

  return undefined;
};

const setStorageToBooked = async (
  club_account_id: string,
  storage_id: string,
  isBooked: boolean,
) => {
  const tableName = process.env.STORAGE_TABLE_NAME as string;
  if (!tableName) {
    throw new Error("Server misconfigured: missing STORAGE_TABLE_NAME");
  }

  const key = { club_account_id, storage_id };

  // updateItem signature:
  // (table_name, key, update_expression, expression_attribute_names, expression_attribute_values, condition_expression?, return_values?)
  await updateItem(
    tableName,
    key,
    "SET #isBooked = :booked, #pending_booked = :pending_booked",
    {
      "#isBooked": "isBooked",
      "#pending_booked": "pending_booked",
    },
    {
      ":booked": isBooked,
      ":pending_booked": false,
    },
  );
};

async function updateClubsStorageBilling(club_account_id: string, fee: number) {
  const tableName = process.env.MONTHLY_BILLING_TABLE_NAME as string;
  if (!tableName) {
    throw new Error("Server misconfigured: missing MONTHLY_BILLING_TABLE_NAME");
  }

  const now = new Date();
  const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  await updateItem(
    tableName,
    {
      club_account_id: club_account_id,
      year_month: year_month,
    },
    `SET 
      #total_amount = if_not_exists(#total_amount, :zero) + :storage_fee,
      #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + :storage_fee,
      #storage_amount = if_not_exists(#storage_amount, :zero) + :storage_fee,
      #month_paid = :month_paid
    `,
    {
      "#total_amount": "total_amount",
      "#outstanding_amount": "outstanding_amount",
      "#storage_amount": "storage_amount",
      "#month_paid": "month_paid",
    },
    {
      ":zero": 0,
      ":storage_fee": fee,
      ":month_paid": false,
    },
  );
}

const cancelStorageTransaction = async (
  club_account_id: string,
  transaction_id: string,
) => {
  await updateItem(
    process.env.TRANSACTIONS_TABLE_NAME as string,
    {
      club_account_id,
      transaction_id,
    },
    "SET #status = :status, #lifecycle.#ts = :lifecycleValue",
    {
      "#status": "status",
      "#lifecycle": "lifecycle",
      "#ts": `${Date.now()}`,
    },
    {
      ":status": "CANCELLED",
      ":lifecycleValue": {
        type: "CANCELLATION",
        description: "Transaction cancelled due to storage rejection",
        amount: "N/A",
        payment_type: "N/A",
      },
    },
  );
};

const confirmStorageTransaction = async (
  club_account_id: string,
  transaction_id: string,
  payment_amount: number,
  payment_type: string,
) => {
  await updateItem(
    process.env.TRANSACTIONS_TABLE_NAME as string,
    {
      club_account_id,
      transaction_id,
    },
    "SET #amount_paid = #amount_paid + :payment_amount, #status = :status, #lifecycle.#ts = :lifecycleValue",
    {
      "#amount_paid": "amount_paid",
      "#status": "status",
      "#lifecycle": "lifecycle",
      "#ts": `${Date.now()}`,
    },
    {
      ":status": "PAID",
      ":payment_amount": payment_amount,
      ":lifecycleValue": {
        type: "CONFIRMATION",
        description: "Payment confirmation",
        amount: payment_amount,
        payment_type,
      },
    },
  );
};

export const handler = async (event: any) => {
  const { origin, body } = deconstructEvent(event);

  try {
    const validationError = validateUpdatableFields(body);
    if (validationError) {
      return createResponse(400, { message: validationError }, origin);
    }

    const storage_request_id = body?.storage_request_id ?? body?.id;
    const club_account_id = body?.club_account_id;

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

    if (!club_account_id || typeof club_account_id !== "string") {
      return createResponse(
        400,
        {
          message: "club_account_id is required and must be a non-empty string",
        },
        origin,
      );
    }

    const existingStorageRequest = await getItem(tableName, {
      storage_request_id,
      club_account_id,
    });

    if (!existingStorageRequest) {
      return createResponse(
        404,
        { message: "Storage request not found" },
        origin,
      );
    }

    // Build dynamic UpdateExpression
    const updateParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, any> = {};

    const pushUpdate = (
      attrName: string,
      value: any,
      placeholderName: string,
    ) => {
      const nameKey = `#${attrName}`;
      const valueKey = `:${placeholderName}`;
      updateParts.push(`${nameKey} = ${valueKey}`);
      exprNames[nameKey] = attrName;
      exprValues[valueKey] = value;
    };

    if (body.status !== undefined) pushUpdate("status", body.status, "status");
    if (body.paid !== undefined) pushUpdate("paid", body.paid, "paid");
    if (body.costCents !== undefined)
      pushUpdate("costCents", body.costCents, "costCents");
    if (body.paymentMethod !== undefined)
      pushUpdate("paymentMethod", body.paymentMethod, "paymentMethod");
    if (body.paymentIntentId !== undefined)
      pushUpdate("paymentIntentId", body.paymentIntentId, "paymentIntentId");
    if (body.notes !== undefined) pushUpdate("notes", body.notes, "notes");
    if (body.date !== undefined) pushUpdate("date", body.date, "date");
    if (body.userId !== undefined) pushUpdate("userId", body.userId, "userId");

    // Always update updatedAt
    const now = new Date().toISOString();
    pushUpdate("updatedAt", now, "updatedAt");

    if (updateParts.length === 0) {
      return createResponse(
        400,
        { message: "No updatable fields provided" },
        origin,
      );
    }

    const updateExpression = `SET ${updateParts.join(", ")}`;

    try {
      // updateItem signature:
      // (table_name, key, update_expression, expression_attribute_names, expression_attribute_values, condition_expression?, return_values?)
      const updated = await updateItem(
        tableName,
        { storage_request_id, club_account_id },
        updateExpression,
        exprNames,
        exprValues,
        "attribute_exists(storage_request_id)",
        true, // return ALL_NEW
      );

      const transitionedToPaid =
        body.paid === true && existingStorageRequest.paid !== true;
      const resolvedTransactionId =
        updated?.transaction_id ?? existingStorageRequest.transaction_id;

      if (body.status === "approved" && body.storage_id && club_account_id) {
        // Set storage to booked (isBooked = true) so it no longer appears available in list_storage function or disabled for purchasing
        if (transitionedToPaid && resolvedTransactionId) {
          const paymentAmount = Number(
            updated?.costCents ?? existingStorageRequest.costCents ?? 0,
          );

          if (paymentAmount > 0) {
            await confirmStorageTransaction(
              club_account_id,
              resolvedTransactionId,
              paymentAmount,
              updated?.paymentMethod ??
                existingStorageRequest.paymentMethod ??
                "EFT/Cash",
            );

            await updateClubsStorageBilling(club_account_id, paymentAmount * 0.02);
          }
        }
        await setStorageToBooked(club_account_id, body.storage_id, true);
      } else if (body.status === "cancelled" || body.status === "rejected") {
        if (resolvedTransactionId) {
          await cancelStorageTransaction(
            club_account_id,
            resolvedTransactionId,
          );
        }
        await setStorageToBooked(club_account_id, body.storage_id, false);
      }

      return createResponse(
        200,
        { message: "Successfully updated storage request", item: updated },
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
        { message: err?.message ?? String(err) },
        origin,
      );
    }
  } catch (error: any) {
    console.error("Unhandled error in update_storage_request:", error);
    return createResponse(
      500,
      { message: error.message ?? String(error) },
      origin,
    );
  }
};
