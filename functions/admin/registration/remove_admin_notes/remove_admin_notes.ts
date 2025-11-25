import {
    createResponse,
    deconstructEvent,
    getItem,
    updateItem
} from "./function_helpers";

interface RemoveAdminNotesBody {
    registration_id: string;
    member_id: string;
    note_ids: string[];
}

function validateBody(body: RemoveAdminNotesBody): string | null {
    if (!body.registration_id) return "registration_id is required";
    if (!body.member_id) return "member_id is required";
    if (!body.note_ids) return "note_ids is required";
    if (!Array.isArray(body.note_ids)) return "note_ids must be an array";
    if (body.note_ids.length === 0) return "note_ids array cannot be empty";
    
    for (const id of body.note_ids) {
        if (!id || typeof id !== "string") return "Each note_id must be a non-empty string";
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

        const registration = await getItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                registration_id: body.registration_id,
                user_id: body.member_id
            }
        );

        if (!registration) {
            return createResponse(404, { message: "Registration not found" }, origin);
        }

        const currentNotes = registration.admin_notes || [];
        
        const remainingNotes = currentNotes.filter((note: any) => !body.note_ids.includes(note.id));

        await updateItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                registration_id: body.registration_id,
                user_id: body.member_id
            },
            "SET #admin_notes = :admin_notes",
            { "#admin_notes": "admin_notes" },
            { ":admin_notes": remainingNotes }
        );

        return createResponse(200, { 
            message: `Successfully removed ${body.note_ids.length} admin note(s)`, 
            remaining_notes: remainingNotes 
        }, origin);

    } catch (error: any) {
        console.error("Error removing admin notes:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
