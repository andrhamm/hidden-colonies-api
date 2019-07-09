import { allowedOrigin } from './cookie';

function getHeadersForEvent(event) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(event, ['https://colonies.andrhamm.com', 'http://colonies.andrhamm.com:3000']),
    'Access-Control-Allow-Credentials': true,
  };
}
export function simpleError(event, statusCode, message) {
  const headers = getHeadersForEvent(event);

  console.log(`Returning error: ${statusCode} ${message}`);

  return {
    statusCode,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
    }),
  };
}

export function simpleResponse(event, body, statusCode = 200) {
  const headers = getHeadersForEvent(event);

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  return {
    statusCode,
    headers,
    ...body && { body: JSON.stringify(body) },
  };
}
