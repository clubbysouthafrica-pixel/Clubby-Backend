import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

type ConfigValidator = (value: any) => boolean;

// The backend owns which configuration keys exist. Add new keys here.
const CONFIGURATION_FIELDS: Record<string, ConfigValidator> = {
    send_qr_code_email_on_registration: (value) => typeof value === "boolean",
    send_login_credentials_email_on_registration: (value) => typeof value === "boolean",
};

export const handler = async (event: any) => {
    const { origin, body } = deconstructEvent(event);

    try {
        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "club_account_id (string) is required." }, origin);
        }

        const fields = Object.keys(body).filter((field) => field !== "club_account_id");
        if (fields.length === 0) {
            return createResponse(400, { message: `Provide at least one configuration field: ${Object.keys(CONFIGURATION_FIELDS).join(", ")}.` }, origin);
        }

        for (const field of fields) {
            const isValid = CONFIGURATION_FIELDS[field];
            if (!isValid) {
                return createResponse(400, { message: `Unknown configuration field '${field}'.` }, origin);
            }
            if (!isValid(body[field])) {
                return createResponse(400, { message: `Invalid value provided for configuration field '${field}'.` }, origin);
            }
        }

        const expressionAttributeNames: Record<string, string> = {
            "#updated_on": "updated_on",
            "#created_on": "created_on",
        };
        const expressionAttributeValues: Record<string, any> = {
            ":updated_on": new Date().getTime(),
        };
        const updateParts: string[] = [];

        fields.forEach((field, index) => {
            const nameKey = `#f${index}`;
            const valueKey = `:v${index}`;
            expressionAttributeNames[nameKey] = field;
            expressionAttributeValues[valueKey] = body[field];
            updateParts.push(`${nameKey} = ${valueKey}`);
        });

        await updateItem(
            process.env.REGISTRATION_CONFIGURATION_TABLE_NAME as string,
            { club_account_id: body.club_account_id },
            `SET ${updateParts.join(", ")}, #updated_on = :updated_on, #created_on = if_not_exists(#created_on, :updated_on)`,
            expressionAttributeNames,
            expressionAttributeValues,
        );

        return createResponse(200, { message: "Registration configuration saved successfully." }, origin);

    } catch (error: any) {
        console.error("Update registration configuration error:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
