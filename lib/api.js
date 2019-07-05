import { allowedOrigin } from './cookie';

export function simpleError(statusCode, message) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
    }),
  };
}

export function simpleResponse(event, body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin(event, ['https://colonies.andrhamm.com', 'http://colonies.andrhamm.com:3000']),
      'Access-Control-Allow-Credentials': true,
      // 'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      // 'Access-Control-Allow-Headers': [
      //   'Content-Type',
      //   'X-Amz-Date',
      //   'Authorization',
      //   'X-Api-Key',
      //   'X-Amz-Security-Token',
      //   'X-Amz-User-Agent',
      // ].join(', '),
    },
    body: JSON.stringify(body),
  };
}
