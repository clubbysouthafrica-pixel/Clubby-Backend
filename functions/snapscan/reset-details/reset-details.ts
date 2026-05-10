import { SSMClient, DeleteParameterCommand } from "@aws-sdk/client-ssm";
import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

const ssm_client = new SSMClient({ region: process.env.REGION });

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

		const paramName = `snapscan_details_${parsed.club_account_id}`;

		try {
			await ssm_client.send(new DeleteParameterCommand({
				Name: paramName
			}));
		} catch (err: any) {
			const code = err?.name || err?.Code || err?.code;
			if (code !== "ParameterNotFound") {
				console.error("DeleteParameter error:", err);
				throw err;
			}
		}

		await updateItem(
			process.env.CLUB_TABLE_NAME as string,
			{ club_account_id: parsed.club_account_id as string },
			"SET #snapscan_enabled = :disabled",
			{ "#snapscan_enabled": "snapscan_enabled" },
			{ ":disabled": false }
		);

	return createResponse(200, { message: "SnapScan parameter removed and club disabled for SnapScan." }, origin);

	} catch (error) {
		console.error("Error resetting SnapScan details:", error);
		return createResponse(500, { message: "Internal Server Error" }, origin);
	}
};

