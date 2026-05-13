import { randomBytes } from "crypto";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { addItem, createResponse, deconstructEvent, decryptData, getItem, queryItems } from "./function_helpers";

type SnapScanFetchQrCodeBody = {
	club_account_id?: string;
	transaction_id?: string;
	user_id?: string;
};

const ssm_client = new SSMClient({ region: process.env.REGION });

const getInitials = (value: string) => {
	const initials = value
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase())
		.filter(Boolean)
		.join("");

	return initials.padEnd(2, "X");
};

const generateMerchantReference = (username: string, clubName: string) => {
	const now = new Date();
	const year = String(now.getFullYear()).slice(-2);
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const clubInitials = getInitials(clubName);
	const userInitials = getInitials(username);
	const randomPart = BigInt(`0x${randomBytes(4).toString("hex")}`)
		.toString(36)
		.toUpperCase()
		.slice(-5)
		.padStart(5, "0");

	return `${clubInitials}-${userInitials}-${year}/${month}/${day}-${randomPart}`;
};

function validateBody(body: SnapScanFetchQrCodeBody): string | null {
	if (!body.club_account_id) return "club_account_id is required";
	if (!body.transaction_id) return "transaction_id is required";
	if (!body.user_id) return "user_id is required";
	return null;
}

const getSnapScanMerchantKey = async (club_account_id: string) => {
	const paramName = `snapscan_details_${club_account_id}`;

	try {
		const param = await ssm_client.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
		const raw = param.Parameter?.Value;

		if (!raw) {
			throw new Error("SnapScan configuration not found.");
		}

		const snapScanConfig = JSON.parse(await decryptData(raw));
		if (!snapScanConfig.merchant_id) {
			throw new Error("SnapScan configuration incomplete.");
		}

		return snapScanConfig.merchant_id as string;
	} catch (error: any) {
		const code = error?.name || error?.Code || error?.code;
		if (code === "ParameterNotFound") {
			throw new Error("SnapScan configuration not found.");
		}

		if (error instanceof Error && ["SnapScan configuration not found.", "SnapScan configuration incomplete."].includes(error.message)) {
			throw error;
		}

		console.error("Error fetching SnapScan config from SSM:", error);
		throw new Error("Internal Server Error");
	}
};

export const handler = async (event: any) => {
	const { origin, query_string_params, user_id } = deconstructEvent(event);

	try {
		const parsed: SnapScanFetchQrCodeBody = typeof query_string_params === "string" ? JSON.parse(query_string_params || "{}") : (query_string_params || {});

		const validationError = validateBody(parsed);
		if (validationError) {
			return createResponse(400, { message: validationError }, origin);
		}

		let userIdToUse = parsed.user_id === "LOGGED_IN" ? user_id : parsed.user_id;

		const club = await getItem(process.env.CLUB_TABLE_NAME as string, { club_account_id: parsed.club_account_id as string });
		if (!club) {
			return createResponse(400, { message: "Club not found." }, origin);
		}

		const matchingPayments = await queryItems(
			process.env.SNAPSCAN_PAYMENTS_TABLE_NAME as string,
			"transaction_id = :transaction_id",
			{ ":transaction_id": parsed.transaction_id as string },
			"TransactionIDIndex"
		);
		const existingPayment = matchingPayments?.find(
			(payment: any) => payment.club_account_id === parsed.club_account_id && payment.user_id === userIdToUse
		);

		if (existingPayment != null) {

			if (existingPayment?.paid) {
				return createResponse(400, { message: "This transaction has already been paid." }, origin);
			}

			const merchantKey = await getSnapScanMerchantKey(parsed.club_account_id as string);
			return createResponse(200, {
				merchant_key: merchantKey,
				merchant_reference: existingPayment.merchant_reference
			}, origin);
		}

		try {
			const user = await getItem(
				process.env.USERS_TABLE_NAME as string, 
				{ 
					user_type: "MEMBER",
					user_id: userIdToUse as string
				}
			);
			if (!user) {
				return createResponse(400, { message: "User not found." }, origin);
			}
			const username = `${user.first_name || ""} ${user.surname || ""}`.trim();
			const merchantKey = await getSnapScanMerchantKey(parsed.club_account_id as string);
			let merchantReference: string | null = null;
			const ttl = Math.floor(Date.now() / 1000) + (5 * 60 * 60 * 24);

			for (let attempt = 0; attempt < 3; attempt += 1) {
				const candidateReference = generateMerchantReference(username, club.club_name || "");

				try {
					await addItem(
						process.env.SNAPSCAN_PAYMENTS_TABLE_NAME as string,
						{
							merchant_reference: candidateReference,
							club_account_id: parsed.club_account_id as string,
							user_id: userIdToUse as string,
							transaction_id: parsed.transaction_id as string,
							ttl
						},
						"attribute_not_exists(merchant_reference)"
					);

					merchantReference = candidateReference;
					break;
				} catch (addItemError: any) {
					const addItemCode = addItemError?.name || addItemError?.Code || addItemError?.code;
					if (addItemCode !== "ConditionalCheckFailedException") {
						throw addItemError;
					}
				}
			}

			if (!merchantReference) {
				throw new Error("Unable to generate a unique merchant reference.");
			}

			return createResponse(200, {
				merchant_key: merchantKey,
				merchant_reference: merchantReference
			}, origin);
		} catch (err: any) {
			const code = err?.name || err?.Code || err?.code;
			if (["SnapScan configuration not found.", "SnapScan configuration incomplete."].includes(err?.message)) {
				return createResponse(400, { message: err.message }, origin);
			}

			if (code === "ConditionalCheckFailedException") {
				throw new Error("Payment cannot be processed through SnapScan currently. Merchant reference already exists.");
			}

			return createResponse(500, { message: "Internal Server Error" }, origin);
		}
	} catch (error: any) {
		console.error("Error fetching SnapScan QR code:", error);
		const message = error?.message || "Internal Server Error";
		const statusCode = error?.$metadata?.httpStatusCode || 500;
		return createResponse(statusCode, { message }, origin);
	}
};
