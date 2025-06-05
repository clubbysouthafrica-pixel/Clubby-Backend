export const deconstructEvent = (event: any) => {
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)
    
    const body = JSON.parse(event.body);
    const query_string_params = event.queryStringParameters;

    return { origin, body, query_string_params }
};