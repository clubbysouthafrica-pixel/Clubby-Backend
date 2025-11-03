import { SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand, DescribeSecretCommand } from "@aws-sdk/client-secrets-manager";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

const sm_client = new SecretsManagerClient({ region: process.env.REGION });

type PayfastDetailsBody = {
    club_account_id?: string;
    merchant_id?: string;
    merchant_key?: string;
    passphrase?: string;
};

function validateBody(body: PayfastDetailsBody): string | null {
    if (!body.club_account_id) return "club_account_id is required";
    if (!body.merchant_id) return "merchant_id is required";
    if (!body.merchant_key) return "merchant_key is required";
    return null;
}

export const handler = async (event: any) => {
    const { origin, body } = deconstructEvent(event);

    try {
        const parsed: PayfastDetailsBody = typeof body === "string" ? JSON.parse(body || "{}") : (body || {});

        const validationError = validateBody(parsed);
        if (validationError) {
            return createResponse(400, { message: validationError }, origin);
        }

        const secretName = `payfast_details_${parsed.club_account_id}`;

        const baseSecret: Record<string, string> = {
            merchant_id: parsed.merchant_id!,
            merchant_key: parsed.merchant_key!,
        };

        let exists = false;
        try {
            await sm_client.send(new DescribeSecretCommand({ SecretId: secretName }));
            exists = true;
        } catch (err: any) {
            const code = err?.name || err?.Code || err?.code;
            if (code !== "ResourceNotFoundException") {
                console.error("DescribeSecret error:", err);
                throw err;
            }
        }

        if (exists) {
            if (parsed.passphrase && parsed.passphrase.trim() !== "") {
                baseSecret.passphrase = parsed.passphrase;
            } else {
                try {
                    const current = await sm_client.send(new GetSecretValueCommand({ SecretId: secretName }));
                    if (current.SecretString) {
                        const currentObj = JSON.parse(current.SecretString);
                        if (currentObj?.passphrase) {
                            baseSecret.passphrase = currentObj.passphrase;
                        }
                    }
                } catch (e) {
                    console.warn("Could not read existing secret to preserve passphrase:", e);
                }
            }

            await sm_client.send(new PutSecretValueCommand({
                SecretId: secretName,
                SecretString: JSON.stringify(baseSecret),
            }));
            await updateItem(
                process.env.CLUB_TABLE_NAME as string,
                {
                    club_account_id: parsed.club_account_id as string
                },
                "SET #payfast_enabled = :payfast_enabled",
                {
                    "#payfast_enabled": "payfast_enabled"
                },
                {
                    ":payfast_enabled": true
                }
            );
            return createResponse(200, { message: "Secret updated" }, origin);
        } else {
            if (parsed.passphrase && parsed.passphrase.trim() !== "") {
                baseSecret.passphrase = parsed.passphrase;
            }
            await sm_client.send(new CreateSecretCommand({
                Name: secretName,
                SecretString: JSON.stringify(baseSecret),
            }));
            return createResponse(200, { message: "Secret created" }, origin);
        }
    } catch (error) {
        console.error("Error storing PayFast details:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};

