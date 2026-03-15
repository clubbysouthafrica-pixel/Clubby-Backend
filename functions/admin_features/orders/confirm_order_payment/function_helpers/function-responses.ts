const allowedOrigins = [
    process.env.ALLOWED_ORIGIN
];

export const createResponse = (statusCode: number, data: object, origin: string) => {
    const allowOrigin = allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];

    const response = {
        statusCode: statusCode,
        body: JSON.stringify(data),
        headers: {
            "Access-Control-Allow-Origin": allowOrigin,
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT",
            "Access-Control-Allow-Headers": "Content-Type,X-Requested-With,Authorization",
            "Access-Control-Allow-Credentials": "true"
        },
    };
    console.log(`RESPONSE @ ${new Date()}: `, response);
    return response;
};