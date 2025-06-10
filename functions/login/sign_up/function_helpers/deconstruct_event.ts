import jwt from "jsonwebtoken"

export const deconstructEvent = (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    const decoded = jwt.decode(event.headers.Authorization);
    console.log('Decoded: ', decoded)
    
    const body = JSON.parse(event.body);
    const query_string_params = event.queryStringParameters;

    return { origin, body, query_string_params }
};