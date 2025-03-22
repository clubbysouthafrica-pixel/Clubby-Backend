import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';
import jwt from 'jsonwebtoken';

const ssmClient = new SSMClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    try {
        const SECRET_KEY = process.env.JWT_SECRET as string;
        const payload = {
            userId: process.env.USER_ID,
            token: process.env.TOKEN
        };
        const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '24h' });

        const command = new PutParameterCommand({
            Name: process.env.SSM_TOKEN_NAME,
            Value: token,
            Type: 'SecureString',
            Overwrite: true,
        });

        const response = await ssmClient.send(command);
        console.log('Token updated successfully:', response);
        return { message: "Success" }
    } catch (error) {
        console.error("Error:", error)
        return { message: "Internal Server Error" }
    }
};
