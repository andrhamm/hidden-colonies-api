class DynamoDBRepository {
  constructor(client, table) {
    this.client = client;
    this.table = table;
  }

  async get(id) {
    const { Item } = await this.client.get({
      TableName: this.table,
      Key: { id },
    }).promise();
    return Item;
  }

  async listByUser(uid) {
    const { Items } = this.client.query({
      TableName: this.table,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': uid,
      },
    });
    return Items;
  }
}

module.exports = DynamoDBRepository;
