import AWS from 'aws-sdk';

const cognitoidentity = new AWS.CognitoIdentity({ apiVersion: '2014-06-30' });
const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
const dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
// export const cwe = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
// export const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
// export const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
// export const sns = new AWS.SNS({ apiVersion: '2010-03-31' });
// export const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const dynamodbUnmarshall = AWS.DynamoDB.Converter.unmarshall;
const dynamodbMarshall = AWS.DynamoDB.Converter.marshall;
// const DynamoDBSet = require('aws-sdk/lib/dynamodb/set');
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

/* START ApiGatewayManagementApi injection */
//     the following section injects the new ApiGatewayManagementApi service
//     into the Lambda AWS SDK, otherwise you'll have to deploy the entire new version of the SDK
const { Service, apiLoader } = AWS;

apiLoader.services.apigatewaymanagementapi = {};

const model = {
  metadata: {
    apiVersion: '2018-11-29',
    endpointPrefix: 'execute-api',
    signingName: 'execute-api',
    serviceFullName: 'AmazonApiGatewayManagementApi',
    serviceId: 'ApiGatewayManagementApi',
    protocol: 'rest-json',
    jsonVersion: '1.1',
    uid: 'apigatewaymanagementapi-2018-11-29',
    signatureVersion: 'v4',
  },
  operations: {
    PostToConnection: {
      http: {
        requestUri: '/@connections/{connectionId}',
        responseCode: 200,
      },
      input: {
        type: 'structure',
        members: {
          Data: {
            type: 'blob',
          },
          ConnectionId: {
            location: 'uri',
            locationName: 'connectionId',
          },
        },
        required: ['ConnectionId', 'Data'],
        payload: 'Data',
      },
    },
  },
  paginators: {},
  shapes: {},
};

AWS.ApiGatewayManagementApi = Service.defineService('apigatewaymanagementapi', ['2018-11-29']);
Object.defineProperty(apiLoader.services.apigatewaymanagementapi, '2018-11-29', {
  // eslint-disable-next-line
  get: function get() {
    return model;
  },
  enumerable: true,
  configurable: true,
});
/* END ApiGatewayManagementApi injection */

// Help function to generate an IAM policy
const generatePolicy = (principalId, effect, resource, context) => {
  // Required output:
  const authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
    const policyDocument = {};
    policyDocument.Version = '2012-10-17'; // default version
    policyDocument.Statement = [];
    const statementOne = {};
    statementOne.Action = 'execute-api:Invoke'; // default action
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }
  // Optional output with custom properties of the String, Number or Boolean type.
  if (context) {
    authResponse.context = context;
  }
  return authResponse;
};

const generateAllow = (principalId, resource, context) => generatePolicy(principalId, 'Allow', resource, context);

const generateDeny = (principalId, resource, context) => generatePolicy(principalId, 'Deny', resource, context);

module.exports = {
  AWS,
  cognitoidentity,
  cognitoidentityserviceprovider,
  dynamodb,
  dynamodbUnmarshall,
  dynamodbMarshall,
  // DynamoDBSet,
  generateAllow,
  generateDeny,
  ses,
};
