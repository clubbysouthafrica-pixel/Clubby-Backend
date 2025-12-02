import {
    createResponse,
    deconstructEvent,
    updateItem
} from "./function_helpers";

interface AdminNote {
    id: string;
    title: string;
    content: string;
}

interface UpdateAdminNotesBody {
    registration_id: string;
    member_id: string;
    admin_notes: AdminNote[];
}

function validateBody(body: UpdateAdminNotesBody): string | null {
    if (!body.registration_id) return "registration_id is required";
    if (!body.admin_notes) return "admin_notes is required";
    if (!body.member_id) return "member_id is required";
    if (!Array.isArray(body.admin_notes)) return "admin_notes must be an array";

    for (const note of body.admin_notes) {
        if (!note.id) return "Each note must have an id";
        if (!note.title) return "Each note must have a title";
        if (note.content === undefined || note.content === null) return "Each note must have content";
    }

    return null;
}

export const handler = async (event: any) => {
    const { origin, body, user_id } = deconstructEvent(event);

    try {
        const validationError = validateBody(body);
        if (validationError) {
            return createResponse(400, { message: validationError }, origin);
        }

        await updateItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                registration_id: body.registration_id,
                user_id: body.member_id
            },
            "SET #admin_notes = :admin_notes",
            { "#admin_notes": "admin_notes" },
            { ":admin_notes": body.admin_notes }
        );

        return createResponse(200, { message: "Admin notes updated successfully", admin_notes: body.admin_notes }, origin);

    } catch (error: any) {
        console.error("Error updating admin notes:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
