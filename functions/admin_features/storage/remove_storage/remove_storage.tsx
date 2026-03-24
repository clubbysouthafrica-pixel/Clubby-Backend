import {
  createResponse,
  deconstructEvent,
  removeItem,
} from "./function_helpers";

export const handler = async (event: any) => {
  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {
    // Accept id from body or query string. Support both snake_case and camelCase.
    const storage_id =
      body?.storage_id ??
      body?.id ??
      query_string_params?.storage_id ??
      query_string_params?.id;

    if (
      !storage_id ||
      typeof storage_id !== "string" ||
      storage_id.trim() === ""
    ) {
      return createResponse(
        400,
        {
          message:
            "storage_id (or id) is required and must be a non-empty string",
        },
        origin,
      );
    }

    const tableName = process.env.STORAGE_TABLE_NAME as string;
    if (!tableName) {
      return createResponse(
        500,
        { message: "Server misconfigured: missing STORAGE_TABLE_NAME" },
        origin,
      );
    }

    // removeItem returns the old item if return_old_item is true, otherwise null.
    const oldItem = await removeItem(tableName, { storage_id }, true);

    if (!oldItem) {
      // Nothing was deleted (item didn't exist)
      return createResponse(
        404,
        { message: "Storage item not found", storage_id },
        origin,
      );
    }

    return createResponse(
      200,
      {
        message: "Successfully removed storage item.",
        storage_id,
        item: oldItem,
      },
      origin,
    );
  } catch (error: any) {
    console.error("Error removing storage item:", error);
    return createResponse(500, { message: error.message }, origin);
  }
};
