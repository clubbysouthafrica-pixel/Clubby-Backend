import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: process.env.REGION });

const allowedOrigins = [
  "http://localhost:5173"
];

const createResponse = (statusCode: number, data: object, origin: string) => {
  const allowOrigin = allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0];
  
  const response = {
      statusCode: statusCode,
      body: JSON.stringify(data),
      headers: {
          "Access-Control-Allow-Origin": allowOrigin,
          "Access-Control-Allow-Methods": "GET,POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
  };
  console.log(`RESPONSE @ ${new Date()}: `, response);
  return response;
};

export const handler = async (event: any) => {
  console.log(`EVENT @ ${new Date()}: `, event);
  const origin = event.headers.origin;
  console.log(`Called by origin: ${origin}`)
  
  try {
    const body = JSON.parse(event.body);

    if (body.userId !== process.env.USER_ID || body.token !== process.env.TOKEN ) {
        return createResponse(404, { message: "Invalid credentials." }, origin);
    }

    const command = new GetParameterCommand({
        Name: process.env.SSM_TOKEN_NAME,
        WithDecryption: true,
    });
    const response = await ssmClient.send(command);
    const parameterValue = response.Parameter?.Value;

    return createResponse(200, { token: parameterValue }, origin);
  } catch (error) {
    console.error("Error:", error);
    return createResponse(500, { message: "Internal Server Error" }, origin);
  }
};
