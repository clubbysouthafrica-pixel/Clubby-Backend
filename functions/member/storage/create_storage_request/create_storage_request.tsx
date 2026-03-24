import {
  createResponse,
  deconstructEvent,
  addItem,
  updateItem,
} from "./function_helpers";
import { randomUUID } from "crypto";

/**
 * Member Create/Update Storage Request
 *
 * Behavior:
 * - If body.storage_request_id (or id) is provided => attempt to update the existing request.
 *   - Uses updateItem with ConditionExpression "attribute_exists(storage_request_id)" so updates only succeed when the item exists.
 * - If no id provided => create a new storage request (addItem) with generated id.
 *
 * Stored shape (DynamoDB item):
 * {
 *   storage_request_id,
 *   storage_id,
 *   userId,
 *   date,
 *   status,            // default 'pending'
 *   costCents,
 *   paymentMethod,
 *   paid,
 *   paymentIntentId?,  // optional
 *   notes?,            // optional
 *   createdAt,
 *   updatedAt
 * }
 */

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

export const handler = async (event: any) => {
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    const validationErrors = validateInput(body);
    if (validationErrors) {
      return createResponse(400, { message: validationErrors }, origin);
    }

    const tableName = process.env.STORAGE_REQUESTS_TABLE_NAME as string;
    if (!tableName) {
      return createResponse(
        500,
        {
          message: "Server misconfigured: missing STORAGE_REQUESTS_TABLE_NAME",
        },
        origin,
      );
    }

    // Normalize inputs
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

    // Create new storage request
    const newId = randomUUID();
    const item = {
      storage_request_id: newId,
      storage_id,
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
    };

    try {
      // create-only to avoid accidental overwrite if id collision (very unlikely with UUID)
      await addItem(
        tableName,
        item,
        "attribute_not_exists(storage_request_id)",
      );
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
