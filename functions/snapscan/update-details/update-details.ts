import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { createResponse, deconstructEvent, updateItem, encryptData } from "./function_helpers";

const ssm_client = new SSMClient({ region: process.env.REGION });

type SnapScanDetailsBody = {
    club_account_id?: string;
    merchant_id?: string;
    api_key?: string;
};

function validateBody(body: SnapScanDetailsBody): string | null {
    if (!body.club_account_id) return "club_account_id is required";
    if (!body.merchant_id) return "merchant_id is required";
    if (!body.api_key) return "api_key is required";
    return null;
}

export const handler = async (event: any) => {
    const { origin, body } = deconstructEvent(event);

    try {
        const parsed: SnapScanDetailsBody = typeof body === "string" ? JSON.parse(body || "{}") : (body || {});

        const validationError = validateBody(parsed);
        if (validationError) {
            return createResponse(400, { message: validationError }, origin);
        }

        const snapScanApiUrl = "https://pos.snapscan.io/merchant/api/v1/payments";
        const snapScanMerchantUrl = `https://pos.snapscan.io/qr/${encodeURIComponent(parsed.merchant_id as string)}?id=order123456&amount=1000`;
        const basicAuthToken = Buffer.from(`${parsed.api_key as string}:`).toString("base64");

        const snapScanApiResponse = await fetch(snapScanApiUrl, {
            method: "GET",
            headers: {
                Authorization: `Basic ${basicAuthToken}`,
                "Content-Type": "application/json",
            },
        });
        console.log("SnapScan API response:", snapScanApiResponse, "for URL:", snapScanApiUrl);

        if (snapScanApiResponse.status !== 200) {
            return createResponse(400, { message: "SnapScan connectivity failed. Please ensure the SnapScan API key is correct." }, origin);
        }

        const snapScanMerchantResponse = await fetch(snapScanMerchantUrl, {
            method: "GET",
        });

        console.log("SnapScan merchant response:", snapScanMerchantResponse, "for URL:", snapScanMerchantUrl);

        if (snapScanMerchantResponse.status !== 200) {
            return createResponse(400, { message: "SnapScan connectivity failed. Please ensure the SnapScan merchant id is correct." }, origin);
        }

        console.log("SnapScan verification API responded with 200:", snapScanApiUrl);
        console.log("SnapScan merchant URL responded with 200:", snapScanMerchantUrl);

        const paramName = `snapscan_details_${parsed.club_account_id}`;
        const valueObj: Record<string, string> = {
            merchant_id: parsed.merchant_id!,
            api_key: parsed.api_key!,
        };

        try {
            await ssm_client.send(new PutParameterCommand({
                Name: paramName,
                Type: "SecureString",
                Value: await encryptData(JSON.stringify(valueObj), process.env.KMS_KEY_ID as string),
                Overwrite: false,
                Tier: "Standard",
            }));

            await updateItem(
                process.env.CLUB_TABLE_NAME as string,
                { club_account_id: parsed.club_account_id as string },
                "SET #snapscan_enabled = :enabled",
                { "#snapscan_enabled": "snapscan_enabled" },
                { ":enabled": true }
            );

            return createResponse(200, { message: "Parameter created and SnapScan connectivity verified", verification_url: snapScanApiUrl, merchant_verification_url: snapScanMerchantUrl }, origin);
        } catch (err: any) {
            const code = err?.name || err?.Code || err?.code;
            if (code === "ParameterAlreadyExists") {
                return createResponse(200, { message: "Parameter already exists and SnapScan connectivity verified", verification_url: snapScanApiUrl, merchant_verification_url: snapScanMerchantUrl }, origin);
            }
            console.error("PutParameter error:", err);
            throw err;
        }
    } catch (error) {
        console.error("Error storing SnapScan details:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};

