import { dynamodb, cognitoidentityserviceprovider, dynamodbMarshall } from './aws-clients';

export function getCurrentUserSub(event) {
  const authProvider = event.requestContext.identity.cognitoAuthenticationProvider;
  const parts = authProvider.split(':');
  const userPoolUserId = parts[parts.length - 1];

  // const userPoolIdParts = parts[parts.length - 3].split('/');
  // const userPoolId = userPoolIdParts[userPoolIdParts.length - 1];

  return userPoolUserId;
}

export async function getUserByUsername(userPoolId, username) {
  console.log(`Fetching for username '${username}' in user pool ${userPoolId}`);

  const user = await cognitoidentityserviceprovider.adminGetUser({
    UserPoolId: userPoolId,
    Username: username,
  }).promise();

  console.log(`User matching '${username}': ${JSON.stringify(user, null, 2)}`);

  return user;
}

export async function getUserBySub(userPoolId, userSub) {
  console.log(`Searching for sub '${userSub}' in user pool ${userPoolId}`);

  const results = await cognitoidentityserviceprovider.listUsers({
    UserPoolId: userPoolId,
    Filter: `sub = "${userSub}"`,
    Limit: 1,
  }).promise();

  console.log(`Users matching '${userSub}': ${JSON.stringify(results, null, 2)}`);

  const { Users: users } = results;

  return users[0];
}

export async function searchUserByUsername(userPoolId, username, exact, limit) {
  const operator = exact ? '=' : '^=';

  console.log(`Searching for username '${username}' in user pool ${userPoolId}`);

  const results = await cognitoidentityserviceprovider.listUsers({
    UserPoolId: userPoolId,
    Filter: `username ${operator} "${username}"`,
    Limit: limit, // max of 60
  }).promise();

  console.log(`Users matching '${username}': ${JSON.stringify(results, null, 2)}`);

  const { Users: users } = results;

  if (limit === 1) {
    return users[0];
  }

  return users;
}

export function getUserAttribute(user, attributeName) {
  const attrsProp = user.Attributes ? 'Attributes' : 'UserAttributes';
  const attr = user[attrsProp].find(({ Name }) => Name === attributeName);
  const val = attr ? attr.Value : null;
  console.log(`user attribute '${attributeName}' for ${user.Username} = ${val}`);
  return val;
}

// basic string updates only
export function updateUser(uuid, attributes, { DYNAMODB_TABLE_NAME_USERS }) {
  const updateExpressionPieces = [];
  const expressionAttrNames = {};
  const expressionAttrValues = {};

  Object.entries({ ...attributes, uuid }).forEach(([k, v]) => {
    const attrName = `#${k.toUpperCase()}`;
    const attrValKey = `:${k}`;
    updateExpressionPieces.push(`${attrName} = ${attrValKey}`);
    expressionAttrNames[attrName] = k;
    expressionAttrValues[attrValKey] = v;
  }, {});

  const updateExpression = `SET ${updateExpressionPieces.join(', ')}`;

  const params = {
    TableName: DYNAMODB_TABLE_NAME_USERS,
    Key: dynamodbMarshall({
      partitionKey: `u:${uuid}`,
    }),
    ExpressionAttributeNames: expressionAttrNames,
    ExpressionAttributeValues: dynamodbMarshall(expressionAttrValues),
    UpdateExpression: updateExpression,
    ReturnValues: 'NONE',
  };

  console.log(`updateItem params: ${JSON.stringify(params, null, 2)}`);

  return dynamodb.updateItem(params).promise();
}
