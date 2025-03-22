import jwt from 'jsonwebtoken';

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    try {
        const SECRET_KEY = process.env.JWT_SECRET as string;
        const payload = {
            userId: process.env.USER_ID,
            token: process.env.TOKEN
        };
        const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '24h' });

        console.log('Successfully generated token and stored.')
        return { message: "Success" }
    } catch (error) {
        console.error("Error:", error)
        return { message: "Internal Server Error" }
    }
};
