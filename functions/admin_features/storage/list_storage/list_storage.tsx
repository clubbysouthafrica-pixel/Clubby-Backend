import {
  createResponse,
  deconstructEvent,
  scanItems,
} from "../create_storage/function_helpers";

export const handler = async (event: any) => {
  const { origin, body, query_string_params } = deconstructEvent(event);

  try {
    // Accept filters from either body or query string (snake_case and camelCase)
    const club_account_id =
      body?.club_account_id ??
      body?.clubId ??
      query_string_params?.club_account_id ??
      query_string_params?.clubId ??
      null;

    let parent_id =
      body?.parent_id ??
      body?.parentId ??
      query_string_params?.parent_id ??
      query_string_params?.parentId;

    // Normalize "null" strings to actual null (useful when passed via query string)
    if (parent_id === "null") parent_id = null;

    const limitParam = query_string_params?.limit ?? body?.limit ?? undefined;
    const offsetParam =
      query_string_params?.offset ?? body?.offset ?? undefined;

    const limit = limitParam !== undefined ? Number(limitParam) : undefined;
    const offset = offsetParam !== undefined ? Number(offsetParam) : 0;

    // Validate limit/offset if provided
    if (
      (limit !== undefined && (Number.isNaN(limit) || limit < 1)) ||
      Number.isNaN(offset) ||
      offset < 0
    ) {
      return createResponse(
        400,
        { message: "Invalid limit/offset parameters" },
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

    // Scan table and filter in memory (keeps the helper usage simple). If you have an index on club_account_id, replace with a Query.
    const items = await scanItems(tableName);

    // items may be [] if none
    let filtered = items;

    if (club_account_id) {
      filtered = filtered.filter(
        (it: any) => it.club_account_id === club_account_id,
      );
    }

    if (parent_id !== undefined) {
      // If parent_id is null, we match items where parent_id is null/undefined
      if (parent_id === null) {
        filtered = filtered.filter(
          (it: any) => it.parent_id === null || it.parent_id === undefined,
        );
      } else {
        filtered = filtered.filter((it: any) => it.parent_id === parent_id);
      }
    }

    const total = filtered.length;

    // Apply simple offset/limit paging
    let paged = filtered;
    if (limit !== undefined) {
      paged = filtered.slice(offset, offset + limit);
    } else if (offset > 0) {
      paged = filtered.slice(offset);
    }

    return createResponse(
      200,
      {
        items: paged,
        total,
        limit: limit ?? null,
        offset: offset ?? 0,
      },
      origin,
    );
  } catch (error: any) {
    console.error("Error listing storage items:", error);
    return createResponse(500, { message: error.message }, origin);
  }
};
