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

export function simpleResponse(event, body, statusCode = 200, extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
    ...getHeadersForEvent(event),
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  return {
    statusCode,
    headers,
    ...body && { body: JSON.stringify(body) },
  };
}

export class HiddenColoniesError extends Error {
  constructor(message) {
    super(message);
    this.originalMessage = message;
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
      },
    };
  }

  toAPIResponse(event) {
    console.log(this);
    console.log(`Returning error: ${this.status} ${this.name} - ${this.message} ${this.originalMessage !== this.message ? ['[', this.originalMessage, ']'].join('') : ''}`);
    return simpleError(event, this.status, this.message);
  }
}

export class BadRequestError extends HiddenColoniesError {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
    this.message = message || 'Bad request.';
    this.status = 400;
  }
}
export class NotFoundError extends HiddenColoniesError {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.message = message || 'Not found.';
    this.status = 404;
  }
}
export class UnauthorizedError extends HiddenColoniesError {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.message = message || 'Unauthorized';
    this.status = 401;
  }
}
export class ForbiddenError extends HiddenColoniesError {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.message = message || 'Forbidden';
    this.status = 403;
  }
}

export class InternalServerError extends HiddenColoniesError {
  constructor(message) {
    super(message);
    this.name = 'InternalServerError';
    this.message = 'Internal server error';
    this.status = 500;
  }
}
