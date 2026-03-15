import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3_client = new S3Client({ region: process.env.REGION });
export async function getSignatureUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: process.env.SIGNATURES_BUCKET_NAME,
        Key: key,
    });

    const signedUrl = await getSignedUrl(s3_client, command, { expiresIn: 3600 });

    return signedUrl;
}