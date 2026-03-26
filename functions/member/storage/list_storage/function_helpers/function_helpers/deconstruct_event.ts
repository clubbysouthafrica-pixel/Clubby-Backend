import jwt from "jsonwebtoken"

export const deconstructEvent = (event: any, get_user_id=true) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    const body = JSON.parse(event.body);
    const query_string_params = event.queryStringParameters;

    if (get_user_id) {
        const decoded = jwt.decode(event.headers?.Authorization);
        const user_id = decoded?.sub as string;

        return { origin, body, query_string_params, user_id }
    }

    return { origin, body, query_string_params }
};