import {
  createResponse,
  deconstructEvent,
  updateItem,
} from "./function_helpers";

/**
 * Admin: Update Storage Request
 *
 * Updates one or more fields on an existing storage request.
 * Expects a body containing `storage_request_id` (or `id`) and the fields to update.
 *
 * Allowed updatable fields:
 * - status (string)
 * - paid (boolean)
 * - costCents (number)
 * - paymentMethod (string)
 * - paymentIntentId (string|null)
 * - notes (string|null)
 * - date (string)
 * - userId (string)
 *
 * This uses the shared `updateItem` helper and enforces that the item exists using
 * ConditionExpression "attribute_exists(storage_request_id)". Returns the updated item.
 */

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

export const handler = async (event: any) => {
  const { origin, body } = deconstructEvent(event);

  try {
    const validationError = validateUpdatableFields(body);
    if (validationError) {
      return createResponse(400, { message: validationError }, origin);
    }

    const storage_request_id = body?.storage_request_id ?? body?.id;

    const tableName = process.env.STORAGE_REQUESTS_TABLE as string;
    if (!tableName) {
      return createResponse(
        500,
        {
          message: "Server misconfigured: missing STORAGE_REQUESTS_TABLE_NAME",
        },
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
        { storage_request_id },
        updateExpression,
        exprNames,
        exprValues,
        "attribute_exists(storage_request_id)",
        true, // return ALL_NEW
      );

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
