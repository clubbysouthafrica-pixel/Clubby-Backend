import {
  createResponse,
  deconstructEvent,
  addItem,
  updateItem,
} from "./function_helpers";
import { randomUUID } from "crypto";

const validatePositiveInteger = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    Number.isNaN(value) ||
    value < 1
  ) {
    return `${fieldName} must be a positive integer if provided`;
  }

  return undefined;
};

const validateStorageInput = (body: any) => {
  const storageName = body?.storage_name ?? body?.name;
  const clubAccountId = body?.storage_id
    ? (body?.club_account_id ?? body?.clubId)
    : (body?.club_account_id ?? body?.clubId);

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

  if (body?.gridPosition !== undefined && body?.gridPosition !== null) {
    const error = validatePositiveInteger(body.gridPosition, "gridPosition");
    if (error) return error;
  }
  if (body?.grid_position !== undefined && body?.grid_position !== null) {
    const error = validatePositiveInteger(body.grid_position, "grid_position");
    if (error) return error;
  }

  if (body?.gridRow !== undefined && body?.gridRow !== null) {
    const error = validatePositiveInteger(body.gridRow, "gridRow");
    if (error) return error;
  }
  if (body?.grid_row !== undefined && body?.grid_row !== null) {
    const error = validatePositiveInteger(body.grid_row, "grid_row");
    if (error) return error;
  }

  if (body?.gridColumn !== undefined && body?.gridColumn !== null) {
    const error = validatePositiveInteger(body.gridColumn, "gridColumn");
    if (error) return error;
  }
  if (body?.grid_column !== undefined && body?.grid_column !== null) {
    const error = validatePositiveInteger(body.grid_column, "grid_column");
    if (error) return error;
  }

  if (body?.layoutRows !== undefined && body?.layoutRows !== null) {
    const error = validatePositiveInteger(body.layoutRows, "layoutRows");
    if (error) return error;
  }
  if (body?.layout_rows !== undefined && body?.layout_rows !== null) {
    const error = validatePositiveInteger(body.layout_rows, "layout_rows");
    if (error) return error;
  }

  if (body?.layoutColumns !== undefined && body?.layoutColumns !== null) {
    const error = validatePositiveInteger(body.layoutColumns, "layoutColumns");
    if (error) return error;
  }
  if (body?.layout_columns !== undefined && body?.layout_columns !== null) {
    const error = validatePositiveInteger(body.layout_columns, "layout_columns");
    if (error) return error;
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

    // Resolve table name from either env var name used across codebase.
    const TABLE_NAME =
      (process.env.STORAGE_TABLE_NAME as string) ??
      (process.env.STORAGE_TABLE as string);
    if (!TABLE_NAME) {
      return createResponse(
        500,
        {
          message:
            "Server misconfigured: missing STORAGE_TABLE_NAME / STORAGE_TABLE env var",
        },
        origin,
      );
    }

    // Normalize incoming fields (support both camelCase and snake_case)
    const storage_name = body?.storage_name ?? body?.name;
    const club_account_id = body?.club_account_id ?? body?.clubId;
    const parent_id = body?.parent_id ?? body?.parentId ?? null;
    const price_cents = body?.price_cents ?? body?.priceCents ?? null;
    const grid_position = body?.grid_position ?? body?.gridPosition;
    const grid_row = body?.grid_row ?? body?.gridRow;
    const grid_column = body?.grid_column ?? body?.gridColumn;
    const layout_rows = body?.layout_rows ?? body?.layoutRows;
    const layout_columns = body?.layout_columns ?? body?.layoutColumns;

    // If storage_id provided, perform update.
    if (body?.storage_id) {
      // Update requires both PK and SK for this table schema:
      // partitionKey: club_account_id, sortKey: storage_id
      if (!club_account_id || typeof club_account_id !== "string") {
        return createResponse(
          400,
          {
            message:
              "To update a storage item you must provide club_account_id (or clubId) along with storage_id",
          },
          origin,
        );
      }

      // Build update expression dynamically so we only set provided fields.
      const updateParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (storage_name !== undefined) {
        updateParts.push("#storage_name = :storage_name");
        expressionAttributeNames["#storage_name"] = "storage_name";
        expressionAttributeValues[":storage_name"] = storage_name;
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

      if (grid_position !== undefined) {
        updateParts.push("#grid_position = :grid_position");
        expressionAttributeNames["#grid_position"] = "grid_position";
        expressionAttributeValues[":grid_position"] = grid_position;
      }

      if (grid_row !== undefined) {
        updateParts.push("#grid_row = :grid_row");
        expressionAttributeNames["#grid_row"] = "grid_row";
        expressionAttributeValues[":grid_row"] = grid_row;
      }

      if (grid_column !== undefined) {
        updateParts.push("#grid_column = :grid_column");
        expressionAttributeNames["#grid_column"] = "grid_column";
        expressionAttributeValues[":grid_column"] = grid_column;
      }

      if (layout_rows !== undefined) {
        updateParts.push("#layout_rows = :layout_rows");
        expressionAttributeNames["#layout_rows"] = "layout_rows";
        expressionAttributeValues[":layout_rows"] = layout_rows;
      }

      if (layout_columns !== undefined) {
        updateParts.push("#layout_columns = :layout_columns");
        expressionAttributeNames["#layout_columns"] = "layout_columns";
        expressionAttributeValues[":layout_columns"] = layout_columns;
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

      // Key must include both partition key and sort key
      const key = { club_account_id, storage_id: body.storage_id };

      // Call updateItem helper:
      // (table_name, key, update_expression, expression_attribute_names, expression_attribute_values, condition_expression?, return_values?)
      await updateItem(
        TABLE_NAME,
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

    // Create path: determine storage_id (supporting both id and storage_id from callers)
    const storage_id = body?.storage_id ?? body?.id ?? randomUUID();

    await addItem(TABLE_NAME, {
      club_account_id,
      storage_id,
      storage_name,
      parent_id,
      price_cents,
      grid_position,
      grid_row,
      grid_column,
      layout_rows,
      layout_columns,
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
