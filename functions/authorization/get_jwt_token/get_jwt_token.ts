import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createResponse, deconstructEvent } from "./function_helpers";

const ssmClient = new SSMClient({ region: process.env.REGION });

export const handler = async (event: any) => {
  
  const { origin, body, query_string_params } = deconstructEvent(event);
  
  try {

    if (body.username !== process.env.LOGIN || body.password !== process.env.PASSWORD ) {
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
