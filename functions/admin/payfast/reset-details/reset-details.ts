import { SecretsManagerClient, DeleteSecretCommand } from "@aws-sdk/client-secrets-manager";
import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

const sm_client = new SecretsManagerClient({ region: process.env.REGION });

type Body = {
	club_account_id?: string;
};

function validateBody(body: Body): string | null {
	if (!body.club_account_id) return "club_account_id is required";
	return null;
}

export const handler = async (event: any) => {
	const { origin, body } = deconstructEvent(event);

	try {
		const parsed: Body = typeof body === "string" ? JSON.parse(body || "{}") : (body || {});

		const validationError = validateBody(parsed);
		if (validationError) {
			return createResponse(400, { message: validationError }, origin);
		}

		const secretName = `payfast_details_${parsed.club_account_id}`;

		try {
			await sm_client.send(new DeleteSecretCommand({
				SecretId: secretName
			}));
		} catch (err: any) {
			const code = err?.name || err?.Code || err?.code;
			if (code !== "ResourceNotFoundException") {
				console.error("DeleteSecret error:", err);
				throw err;
			}
		}

		await updateItem(
			process.env.CLUB_TABLE_NAME as string,
			{ club_account_id: parsed.club_account_id as string },
			"SET #payfast_enabled = :disabled",
			{ "#payfast_enabled": "payfast_enabled" },
			{ ":disabled": false }
		);

		return createResponse(200, { message: "PayFast details removed and club disabled for PayFast." }, origin);

	} catch (error) {
		console.error("Error resetting PayFast details:", error);
		return createResponse(500, { message: "Internal Server Error" }, origin);
	}
};

