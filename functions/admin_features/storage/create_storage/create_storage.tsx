import {
  createResponse,
  deconstructEvent,
  addItem,
  updateItem,
} from "./function_helpers";
import { randomUUID } from "crypto";

const validateStorageInput = (body: any) => {
  const storageName = body?.storage_name ?? body?.name;
  const clubAccountId = body?.club_account_id ?? body?.clubId;

  if (
    !clubAccountId ||
    typeof clubAccountId !== "string" ||
    clubAccountId.trim() === ""
  ) {
    return "Club Account ID (clubId or club_account_id) is required and must be a non-empty string";
  }
  if (
    !storageName ||
    typeof storageName !== "string" ||
    storageName.trim() === ""
  ) {
    return "Storage name (name or storage_name) is required and must be a non-empty string";
  }

  if (
    body?.parentId !== undefined &&
    body?.parentId !== null &&
    typeof body.parentId !== "string"
  ) {
    return "parentId must be a string if provided";
  }
  if (
    body?.parent_id !== undefined &&
    body?.parent_id !== null &&
    typeof body.parent_id !== "string"
  ) {
    return "parent_id must be a string if provided";
  }

  if (body?.priceCents !== undefined && body?.priceCents !== null) {
    if (
      typeof body.priceCents !== "number" ||
      Number.isNaN(body.priceCents) ||
      body.priceCents < 0
    ) {
      return "priceCents must be a non-negative number if provided";
    }
  }
  if (body?.price_cents !== undefined && body?.price_cents !== null) {
    if (
      typeof body.price_cents !== "number" ||
      Number.isNaN(body.price_cents) ||
      body.price_cents < 0
    ) {
      return "price_cents must be a non-negative number if provided";
    }
  }

  return undefined;
};

export const handler = async (event: any) => {
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    const validationErrors = validateStorageInput(body);
    if (validationErrors) {
      return createResponse(400, { message: validationErrors }, origin);
    }

    // Normalize incoming fields (support both camelCase and snake_case)
    const storage_name = body?.storage_name ?? body?.name;
    const club_account_id = body?.club_account_id ?? body?.clubId;
    const parent_id = body?.parent_id ?? body?.parentId ?? null;
    const price_cents = body?.price_cents ?? body?.priceCents ?? null;

    if (body?.storage_id) {
      // Build update expression dynamically so we only set provided fields.
      const updateParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (storage_name !== undefined) {
        updateParts.push("#storage_name = :storage_name");
        expressionAttributeNames["#storage_name"] = "storage_name";
        expressionAttributeValues[":storage_name"] = storage_name;
      }

      if (club_account_id !== undefined) {
        updateParts.push("#club_account_id = :club_account_id");
        expressionAttributeNames["#club_account_id"] = "club_account_id";
        expressionAttributeValues[":club_account_id"] = club_account_id;
      }

      if (parent_id !== undefined) {
        updateParts.push("#parent_id = :parent_id");
        expressionAttributeNames["#parent_id"] = "parent_id";
        // allow null to explicitly clear attribute if caller sends null
        expressionAttributeValues[":parent_id"] = parent_id;
      }

      if (price_cents !== undefined) {
        updateParts.push("#price_cents = :price_cents");
        expressionAttributeNames["#price_cents"] = "price_cents";
        expressionAttributeValues[":price_cents"] = price_cents;
      }

      if (updateParts.length === 0) {
        // Nothing to update
        return createResponse(
          400,
          { message: "No updatable fields provided for storage unit." },
          origin,
        );
      }

      const updateExpression = `SET ${updateParts.join(", ")}`;

      // Key must be an object mapping the primary key attribute(s) to values.
      const key = { storage_id: body.storage_id };

      // Call updateItem with proper parameters.
      // The updateItem helper expects:
      // (table_name, key, update_expression, expression_attribute_names, expression_attribute_values, condition_expression?, return_values?)
      await updateItem(
        process.env.STORAGE_TABLE as string,
        key,
        updateExpression,
        expressionAttributeNames,
        expressionAttributeValues,
        undefined,
        false,
      );

      return createResponse(
        200,
        {
          message: "Successfully updated storage unit.",
          storage_id: body.storage_id,
        },
        origin,
      );
    }

    // Determine storage_id (supporting both id and storage_id from callers)
    const storage_id = body?.storage_id ?? body?.id ?? randomUUID();

    await addItem(process.env.STORAGE_TABLE_NAME as string, {
      storage_id,
      storage_name,
      club_account_id,
      parent_id,
      price_cents,
    });

    return createResponse(
      200,
      { message: "Successfully created storage unit.", storage_id },
      origin,
    );
  } catch (error: any) {
    console.error("Error:", error);
    return createResponse(500, { message: error.message }, origin);
  }
};
