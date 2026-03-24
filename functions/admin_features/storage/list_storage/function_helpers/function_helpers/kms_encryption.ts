import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

const kmsClient = new KMSClient({});

export async function encryptData(plaintext: string, keyId: string): Promise<string> {
    try {
        const command = new EncryptCommand({
            KeyId: keyId,
            Plaintext: new Uint8Array(Buffer.from(plaintext)),
        });

        const response = await kmsClient.send(command);
        
        if (response.CiphertextBlob) {
            return Buffer.from(response.CiphertextBlob).toString('base64');
        }

        throw new Error('Failed to encrypt data: No ciphertext returned');
    } catch (error: any) {
        console.error('Error encrypting data:', error);
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

export async function decryptData(ciphertext: string): Promise<string> {
    try {
        const command = new DecryptCommand({
            CiphertextBlob: new Uint8Array(Buffer.from(ciphertext, 'base64')),
        });

        const response = await kmsClient.send(command);

        if (response.Plaintext) {
            return Buffer.from(response.Plaintext).toString('utf-8');
        }

        throw new Error('Failed to decrypt data: No plaintext returned');
    } catch (error: any) {
        console.error('Error decrypting data:', error);
        return ciphertext;
    }
}
