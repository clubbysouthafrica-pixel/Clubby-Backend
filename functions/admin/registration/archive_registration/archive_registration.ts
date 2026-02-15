import {
    createResponse,
    deconstructEvent,
    getItem,
    updateItem
} from "./function_helpers";

interface ArchiveRegistrationBody {
    registration_id: string;
    user_id: string;
}

function validateBody(body: ArchiveRegistrationBody): string | null {
    if (!body.registration_id) return "registration_id is required";
    if (!body.user_id) return "user_id is required";
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
                user_id: body.user_id
            }
        );

        const currentArchivedValue = registration?.archived ?? false;
        const newArchivedValue = !currentArchivedValue;

        await updateItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                registration_id: body.registration_id,
                user_id: body.user_id
            },
            "SET #archived = :archived",
            { "#archived": "archived" },
            { ":archived": newArchivedValue }
        );

        return createResponse(200, { 
            message: newArchivedValue ? `Successfully archived registration.` : `Successfully un-archived registration.`
        }, origin);

    } catch (error: any) {
        console.error("Error toggling archive status:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
